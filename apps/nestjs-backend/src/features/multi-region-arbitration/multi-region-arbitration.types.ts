/**
 * Multi-region write arbitration — Stage 68.
 *
 * Teable Cloud spans multiple regions (us-east, eu-central, ap-southeast,
 * ...). Each region runs its own primary write-replica and serves writes
 * independently. The catch: when two regions accept overlapping writes
 * to the same logical row, we need a deterministic tiebreaker that picks
 * a winner and clearly marks the loser for replay.
 *
 * This module models the arbitration decision in pure form so the auth
 * service can persist lease elections, conflict records, and replay
 * queues without coupling to transport.
 *
 * The shape: each region holds a short-lived **write lease** (a
 * (resourceKey, region) pair with a TTL). A write is admitted when the
 * lease belongs to the requesting region OR when no live lease exists.
 * Conflicts surface when a second region tries to write while a foreign
 * lease is still live — those writes are stored as **conflict records**
 * with the loser payload intact and dispatched to the **replay queue**
 * once the lease expires.
 *
 * The split-brain detector compares clock skew against
 * `MAX_SKEW_MS` to flag regions that diverged beyond recovery and
 * triggers a manual drain.
 */

export type RegionId = string;

export type LeaseState = 'active' | 'expired' | 'revoked';

export type ConflictResolution = 'last-writer-wins' | 'first-writer-wins' | 'manual';

export interface IWriteLease {
  resourceKey: string;
  regionId: RegionId;
  holderId: string;
  /** ISO timestamp the lease was acquired. */
  acquiredAt: string;
  /** ISO timestamp the lease expires. */
  expiresAt: string;
  /** Monotonic lease generation; bumped on every re-acquire. */
  generation: number;
  state: LeaseState;
}

export interface IRegionClock {
  regionId: RegionId;
  /** ISO timestamp the region believes it is. */
  now: string;
  /** Estimated skew from canonical clock in ms. */
  skewMs: number;
}

export interface IWriteRequest {
  resourceKey: string;
  regionId: RegionId;
  holderId: string;
  /** Logical version of the row the writer based its edit on. */
  baseVersion: number;
  /** Requested lease TTL in ms. */
  ttlMs: number;
  /** Optional override of "now" for tests. */
  now?: string;
}

export type ArbitrationDecision =
  | { kind: 'admit'; lease: IWriteLease }
  | { kind: 'reject'; reason: 'lease-held-elsewhere'; holderRegion: RegionId }
  | { kind: 'reject'; reason: 'expired-lease' }
  | { kind: 'reject'; reason: 'split-brain'; skewMs: number }
  | { kind: 'reject'; reason: 'invalid-request'; message: string };

export interface IConflictRecord {
  id: string;
  resourceKey: string;
  winnerRegion: RegionId;
  loserRegion: RegionId;
  winnerVersion: number;
  loserVersion: number;
  resolution: ConflictResolution;
  detectedAt: string;
  replayedAt: string | null;
}

export interface IReplayQueueEntry {
  id: string;
  conflictId: string;
  regionId: RegionId;
  payload: Record<string, unknown>;
  enqueuedAt: string;
  attempts: number;
  nextAttemptAt: string;
}

export interface IMultiRegionArbitrationOptions {
  /** Default lease TTL when request omits ttlMs. */
  defaultTtlMs?: number;
  /** Hard ceiling on TTL — refuses longer leases. */
  maxTtlMs?: number;
  /** Skew above this triggers split-brain. */
  maxSkewMs?: number;
  /** Resolution strategy when versions conflict. */
  resolution?: ConflictResolution;
  /** Override "now" for tests. */
  now?: string;
}

/** Defaults. */
export const DEFAULT_LEASE_TTL_MS = 5_000;
export const MAX_LEASE_TTL_MS = 60_000;
export const DEFAULT_MAX_SKEW_MS = 2_000;
export const DEFAULT_RESOLUTION: ConflictResolution = 'last-writer-wins';
export const MAX_RESOURCE_KEY_LENGTH = 256;
export const MAX_REPLAY_QUEUE_DEPTH = 1024;
export const REPLAY_BACKOFF_BASE_MS = 500;
export const REPLAY_BACKOFF_CAP_MS = 30_000;

/** Per-resource key shapes seen in production telemetry. */
export const RESOURCE_KEY_KIND_LABELS: Record<string, string> = {
  row: '行级仲裁',
  field: '字段级仲裁',
  attachment: '附件级仲裁',
  view: '视图级仲裁',
  automation: '自动化仲裁',
};
