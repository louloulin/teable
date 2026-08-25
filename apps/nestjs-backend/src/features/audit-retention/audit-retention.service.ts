/**
 * Audit retention policy — pure helpers (Stage 71).
 */

import type {
  IAuditEvent,
  IAuditRetentionOptions,
  IAuditRetentionPolicy,
  IRetentionDecision,
  IRetentionJob,
  RetentionTier,
  StorageTarget,
} from './audit-retention.types';
import {
  DEFAULT_COLD_DAYS,
  DEFAULT_HOT_DAYS,
  MAX_BATCH,
  MAX_COLD_DAYS,
  MAX_HOT_DAYS,
  STORAGE_TARGETS,
} from './audit-retention.types';

/** Whether the input is a recognized storage target. */
export function isStorageTarget(s: string): s is StorageTarget {
  return (STORAGE_TARGETS as ReadonlyArray<string>).includes(s);
}

/** Compute the default hot days. */
export function defaultHotDays(opts?: IAuditRetentionOptions): number {
  return opts?.defaultHotDays ?? DEFAULT_HOT_DAYS;
}

/** Compute the default cold days. */
export function defaultColdDays(opts?: IAuditRetentionOptions): number {
  return opts?.defaultColdDays ?? DEFAULT_COLD_DAYS;
}

/** Maximum hot days. */
export function maxHotDays(): number {
  return MAX_HOT_DAYS;
}

/** Maximum cold days. */
export function maxColdDays(): number {
  return MAX_COLD_DAYS;
}

/** Validate a retention policy. */
export function validatePolicy(p: IAuditRetentionPolicy): string | null {
  if (!p.orgId) return 'orgId required';
  if (p.hotDays < 1 || p.hotDays > MAX_HOT_DAYS) {
    return `hotDays must be in 1..${MAX_HOT_DAYS}`;
  }
  if (p.coldDays < p.hotDays || p.coldDays > MAX_COLD_DAYS) {
    return `coldDays must be ≥ hotDays and ≤ ${MAX_COLD_DAYS}`;
  }
  if (p.coldTarget && !isStorageTarget(p.coldTarget)) {
    return `unknown coldTarget: ${p.coldTarget}`;
  }
  if (p.coldTarget && !p.coldBucket) return 'coldBucket required when coldTarget set';
  return null;
}

/** Normalize a policy — defaults and caps. */
export function normalizePolicy(input: {
  orgId: string;
  hotDays?: number;
  coldDays?: number;
  coldTarget?: StorageTarget | null;
  coldBucket?: string | null;
  coldPrefix?: string | null;
  redactPii?: boolean;
  updatedBy?: string;
  now?: string;
}): IAuditRetentionPolicy {
  const nowIso = input.now ?? new Date().toISOString();
  return {
    orgId: input.orgId,
    hotDays: clamp(input.hotDays ?? DEFAULT_HOT_DAYS, 1, MAX_HOT_DAYS),
    coldDays: clamp(
      input.coldDays ?? DEFAULT_COLD_DAYS,
      input.hotDays ?? DEFAULT_HOT_DAYS,
      MAX_COLD_DAYS
    ),
    coldTarget: input.coldTarget ?? null,
    coldBucket: input.coldBucket ?? null,
    coldPrefix: input.coldPrefix ?? null,
    redactPii: input.redactPii ?? false,
    updatedAt: nowIso,
    updatedBy: input.updatedBy ?? 'system',
  };
}

/** Decide a retention tier for a single event. */
export function decideTier(input: {
  policy: IAuditRetentionPolicy;
  event: IAuditEvent;
  now?: string;
}): IRetentionDecision {
  const nowIso = input.now ?? new Date().toISOString();
  const ageDays = daysBetween(input.event.createdAt, nowIso);
  if (ageDays <= input.policy.hotDays) {
    return {
      eventId: input.event.id,
      tier: 'hot',
      decidedAt: nowIso,
      daysToNext: input.policy.hotDays - ageDays,
    };
  }
  if (ageDays <= input.policy.coldDays) {
    return {
      eventId: input.event.id,
      tier: 'cold',
      decidedAt: nowIso,
      daysToNext: input.policy.coldDays - ageDays,
    };
  }
  return {
    eventId: input.event.id,
    tier: 'purged',
    decidedAt: nowIso,
    daysToNext: 0,
  };
}

/** Plan a retention sweep — count events per tier transition. */
export function planSweep(input: {
  policy: IAuditRetentionPolicy;
  events: IAuditEvent[];
  now?: string;
}): { promote: string[]; purge: string[]; keepHot: number; keepCold: number } {
  const promote: string[] = [];
  const purge: string[] = [];
  let keepHot = 0;
  let keepCold = 0;
  for (const e of input.events) {
    const d = decideTier({
      policy: input.policy,
      event: e,
      ...(input.now ? { now: input.now } : {}),
    });
    if (d.tier === 'hot') keepHot += 1;
    else if (d.tier === 'cold') {
      keepCold += 1;
      promote.push(e.id);
    } else purge.push(e.id);
  }
  return { promote, purge, keepHot, keepCold };
}

/** Split events into batches respecting MAX_BATCH. */
export function batchEvents(events: IAuditEvent[]): IAuditEvent[][] {
  if (events.length <= MAX_BATCH) return [events];
  const out: IAuditEvent[][] = [];
  for (let i = 0; i < events.length; i += MAX_BATCH) {
    out.push(events.slice(i, i + MAX_BATCH));
  }
  return out;
}

/** Estimate storage cost for a tier in bytes (avg row ~512 bytes). */
export function estimateStorageBytes(input: { tier: RetentionTier; count: number }): number {
  const bytesPerEvent = input.tier === 'cold' ? 256 : 512;
  return input.count * bytesPerEvent;
}

/** Mark a job as started. */
export function startJob(input: { id: string; orgId: string; now?: string }): IRetentionJob {
  return {
    id: input.id,
    orgId: input.orgId,
    status: 'running',
    startedAt: input.now ?? new Date().toISOString(),
    finishedAt: null,
    scanned: 0,
    promotedToCold: 0,
    purged: 0,
    lastError: null,
  };
}

/** Mark a job as finished. */
export function finishJob(input: {
  job: IRetentionJob;
  status: 'done' | 'failed';
  scanned: number;
  promoted: number;
  purged: number;
  error?: string | null;
  now?: string;
}): IRetentionJob {
  return {
    ...input.job,
    status: input.status,
    finishedAt: input.now ?? new Date().toISOString(),
    scanned: input.scanned,
    promotedToCold: input.promoted,
    purged: input.purged,
    lastError: input.error ?? null,
  };
}

/** Suggest a sane default policy given an org's plan. */
export function suggestPolicyForPlan(input: {
  orgId: string;
  plan: 'free' | 'pro' | 'enterprise';
  now?: string;
}): IAuditRetentionPolicy {
  const hotDays = input.plan === 'enterprise' ? 365 : input.plan === 'pro' ? 180 : DEFAULT_HOT_DAYS;
  const coldDays =
    input.plan === 'enterprise'
      ? MAX_COLD_DAYS
      : input.plan === 'pro'
        ? 365 * 3
        : DEFAULT_COLD_DAYS;
  return normalizePolicy({
    orgId: input.orgId,
    hotDays,
    coldDays,
    ...(input.plan !== 'free' ? { coldTarget: 's3' as StorageTarget } : {}),
    coldBucket: input.plan !== 'free' ? `audit-${input.orgId}` : null,
    coldPrefix: 'events/',
    updatedBy: 'planner',
    ...(input.now ? { now: input.now } : {}),
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.floor((b - a) / 86_400_000);
}
