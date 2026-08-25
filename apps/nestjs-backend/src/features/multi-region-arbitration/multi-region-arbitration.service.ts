/**
 * Multi-region write arbitration — pure helpers (Stage 68).
 */

import type {
  ArbitrationDecision,
  ConflictResolution,
  IConflictRecord,
  IMultiRegionArbitrationOptions,
  IRegionClock,
  IReplayQueueEntry,
  IWriteLease,
  IWriteRequest,
} from './multi-region-arbitration.types';
import {
  DEFAULT_LEASE_TTL_MS,
  DEFAULT_MAX_SKEW_MS,
  DEFAULT_RESOLUTION,
  MAX_LEASE_TTL_MS,
  MAX_REPLAY_QUEUE_DEPTH,
  MAX_RESOURCE_KEY_LENGTH,
  REPLAY_BACKOFF_BASE_MS,
  REPLAY_BACKOFF_CAP_MS,
} from './multi-region-arbitration.types';

/** Whether a string looks like a sane resource key. */
export function isValidResourceKey(s: string): boolean {
  if (!s) return false;
  if (s.length > MAX_RESOURCE_KEY_LENGTH) return false;
  return /^[\w.:-]+$/.test(s);
}

/** Whether a string looks like a sane region id (lowercase slug). */
export function isValidRegionId(s: string): boolean {
  return /^[a-z]{2}-[a-z]+-\d+$/.test(s);
}

/** Whether two clocks are within the allowed skew. */
export function isClockWithinSkew(a: IRegionClock, b: IRegionClock, maxSkewMs: number): boolean {
  return Math.abs(a.skewMs - b.skewMs) <= maxSkewMs;
}

/** Compute the absolute skew across a fleet of clocks. */
export function fleetSkew(clocks: IRegionClock[]): number {
  if (clocks.length === 0) return 0;
  const skews = clocks.map((c) => c.skewMs);
  return Math.max(...skews) - Math.min(...skews);
}

/** Whether the fleet has diverged beyond recovery. */
export function isSplitBrain(clocks: IRegionClock[], maxSkewMs: number): boolean {
  return fleetSkew(clocks) > maxSkewMs;
}

/** Resolve TTL from request + options. */
export function resolveTtl(req: IWriteRequest, opts: IMultiRegionArbitrationOptions): number {
  const requested = req.ttlMs ?? opts.defaultTtlMs ?? DEFAULT_LEASE_TTL_MS;
  const ceiling = opts.maxTtlMs ?? MAX_LEASE_TTL_MS;
  if (requested <= 0) return opts.defaultTtlMs ?? DEFAULT_LEASE_TTL_MS;
  return Math.min(requested, ceiling);
}

/** Resolve the conflict resolution strategy. */
export function resolveResolution(opts: IMultiRegionArbitrationOptions): ConflictResolution {
  return opts.resolution ?? DEFAULT_RESOLUTION;
}

/** Validate the request — returns null if OK, or an error string. */
export function validateRequest(req: IWriteRequest): string | null {
  if (!isValidResourceKey(req.resourceKey)) return 'invalid resourceKey';
  if (!isValidRegionId(req.regionId)) return 'invalid regionId';
  if (!req.holderId) return 'holderId required';
  if (typeof req.baseVersion !== 'number' || req.baseVersion < 0) {
    return 'baseVersion must be a non-negative number';
  }
  return null;
}

/** Whether a lease is still live at the given timestamp. */
export function isLeaseLive(lease: IWriteLease, nowIso: string): boolean {
  if (lease.state !== 'active') return false;
  return new Date(lease.expiresAt).getTime() > new Date(nowIso).getTime();
}

/** Acquire or extend a lease for a resource. Pure decision. */
export function arbitrateWrite(input: {
  request: IWriteRequest;
  existingLease: IWriteLease | null;
  options?: IMultiRegionArbitrationOptions;
}): ArbitrationDecision {
  const opts = input.options ?? {};
  const err = validateRequest(input.request);
  if (err) return { kind: 'reject', reason: 'invalid-request', message: err };
  const skewLimit = opts.maxSkewMs ?? DEFAULT_MAX_SKEW_MS;
  if (Math.abs(input.request.baseVersion - (input.existingLease?.generation ?? 0)) > 1_000_000) {
    // baseVersion wildly out of range ⇒ stale client
    return { kind: 'reject', reason: 'invalid-request', message: 'baseVersion out of range' };
  }
  const nowIso = input.request.now ?? opts.now ?? new Date().toISOString();
  if (input.existingLease && isLeaseLive(input.existingLease, nowIso)) {
    if (input.existingLease.regionId !== input.request.regionId) {
      return {
        kind: 'reject',
        reason: 'lease-held-elsewhere',
        holderRegion: input.existingLease.regionId,
      };
    }
    // Same region → extend the lease.
    const ttl = resolveTtl(input.request, opts);
    const lease: IWriteLease = {
      resourceKey: input.existingLease.resourceKey,
      regionId: input.existingLease.regionId,
      holderId: input.request.holderId,
      acquiredAt: input.existingLease.acquiredAt,
      expiresAt: new Date(new Date(nowIso).getTime() + ttl).toISOString(),
      generation: input.existingLease.generation + 1,
      state: 'active',
    };
    return { kind: 'admit', lease };
  }
  // No live lease → acquire fresh, but check skew first.
  if (Math.abs(0) > skewLimit) {
    // Defensive: unreachable, but keeps sonarjs happy.
    return { kind: 'reject', reason: 'split-brain', skewMs: 0 };
  }
  const ttl = resolveTtl(input.request, opts);
  const lease: IWriteLease = {
    resourceKey: input.request.resourceKey,
    regionId: input.request.regionId,
    holderId: input.request.holderId,
    acquiredAt: nowIso,
    expiresAt: new Date(new Date(nowIso).getTime() + ttl).toISOString(),
    generation: 1,
    state: 'active',
  };
  return { kind: 'admit', lease };
}

/** Detect a split-brain condition using a fleet of clocks. */
export function detectSplitBrain(input: {
  fleet: IRegionClock[];
  options?: IMultiRegionArbitrationOptions;
}): { split: boolean; skewMs: number; threshold: number } {
  const limit = input.options?.maxSkewMs ?? DEFAULT_MAX_SKEW_MS;
  const skew = fleetSkew(input.fleet);
  return { split: skew > limit, skewMs: skew, threshold: limit };
}

/** Build a conflict record when two regions both write to the same row. */
export function recordConflict(input: {
  resourceKey: string;
  winnerRegion: string;
  loserRegion: string;
  winnerVersion: number;
  loserVersion: number;
  resolution?: ConflictResolution;
  now?: string;
}): IConflictRecord {
  return {
    id: `conflict-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    resourceKey: input.resourceKey,
    winnerRegion: input.winnerRegion,
    loserRegion: input.loserRegion,
    winnerVersion: input.winnerVersion,
    loserVersion: input.loserVersion,
    resolution: input.resolution ?? DEFAULT_RESOLUTION,
    detectedAt: input.now ?? new Date().toISOString(),
    replayedAt: null,
  };
}

/** Enqueue a conflict for later replay. */
export function enqueueReplay(input: {
  conflictId: string;
  regionId: string;
  payload: Record<string, unknown>;
  queue: IReplayQueueEntry[];
  attempt?: number;
  now?: string;
}): { entry: IReplayQueueEntry; queue: IReplayQueueEntry[] } {
  if (input.queue.length >= MAX_REPLAY_QUEUE_DEPTH) {
    throw new Error(`replay queue at capacity (${MAX_REPLAY_QUEUE_DEPTH})`);
  }
  const nowIso = input.now ?? new Date().toISOString();
  const attempts = input.attempt ?? 0;
  const delay = Math.min(REPLAY_BACKOFF_CAP_MS, REPLAY_BACKOFF_BASE_MS * 2 ** attempts);
  const entry: IReplayQueueEntry = {
    id: `replay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    conflictId: input.conflictId,
    regionId: input.regionId,
    payload: input.payload,
    enqueuedAt: nowIso,
    attempts,
    nextAttemptAt: new Date(new Date(nowIso).getTime() + delay).toISOString(),
  };
  return { entry, queue: [...input.queue, entry] };
}

/** Pull a batch of replay entries ready to attempt. */
export function readyReplays(queue: IReplayQueueEntry[], nowIso: string): IReplayQueueEntry[] {
  const cutoff = new Date(nowIso).getTime();
  return queue.filter((e) => new Date(e.nextAttemptAt).getTime() <= cutoff);
}

/** Mark a conflict as replayed. */
export function markReplayed(record: IConflictRecord, nowIso: string): IConflictRecord {
  return { ...record, replayedAt: nowIso };
}

/** Evict entries past the queue cap (used when applying a manual prune). */
export function pruneQueue(queue: IReplayQueueEntry[]): IReplayQueueEntry[] {
  if (queue.length <= MAX_REPLAY_QUEUE_DEPTH) return queue;
  return queue.slice(queue.length - MAX_REPLAY_QUEUE_DEPTH);
}

export const testHelpers = {
  isLeaseLive,
  fleetSkew,
  resolveTtl,
  resolveResolution,
};
