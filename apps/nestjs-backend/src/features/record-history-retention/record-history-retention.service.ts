/**
 * Record-history retention by plan tier — Stage 59.
 *
 * Pure helpers that resolve a plan-tier + optional override into a
 * concrete retention policy. The auth layer adapts these helpers to
 * the per-base subscriber.
 */

import type {
  IPlanRetentionPolicy,
  IResolvedRetention,
  ISubscriberContext,
  PlanTier,
} from './record-history-retention.types';

export const PLAN_RETENTION_POLICIES: Record<PlanTier, IPlanRetentionPolicy> = {
  self_hosted: {
    tier: 'self_hosted',
    retentionDays: 14,
    purgeCron: '0 3 * * *',
    maxRecordsPerBase: 0,
    description: 'Self-hosted keeps 14 days of record history by default.',
  },
  free: {
    tier: 'free',
    retentionDays: 14,
    purgeCron: '0 3 * * *',
    maxRecordsPerBase: 5_000,
    description: 'Free tier keeps 14 days of record history.',
  },
  pro: {
    tier: 'pro',
    retentionDays: 365,
    purgeCron: '0 3 * * *',
    maxRecordsPerBase: 50_000,
    description: 'Pro tier keeps 365 days of record history.',
  },
  business: {
    tier: 'business',
    retentionDays: 1095,
    purgeCron: '0 2 * * *',
    maxRecordsPerBase: 250_000,
    description: 'Business tier keeps 1095 days of record history.',
  },
  enterprise: {
    tier: 'enterprise',
    retentionDays: 1095,
    purgeCron: '0 1 * * *',
    maxRecordsPerBase: 0,
    description: 'Enterprise tier keeps 1095 days; unlimited per-base records.',
  },
};

export const DEFAULT_PURGE_CRON = '0 3 * * *';

export function resolveRetention(ctx: ISubscriberContext): IResolvedRetention {
  const base = PLAN_RETENTION_POLICIES[ctx.tier];
  let days = base.retentionDays;
  let overridden = false;
  if (ctx.enterpriseOverride) {
    days = Infinity;
    overridden = true;
  } else if (typeof ctx.overrideDays === 'number' && ctx.overrideDays > 0) {
    days = ctx.overrideDays;
    overridden = true;
  }
  return {
    tier: ctx.tier,
    retentionDays: days,
    purgeCron: base.purgeCron,
    maxRecordsPerBase: ctx.enterpriseOverride ? 0 : base.maxRecordsPerBase,
    overridden,
  };
}

/** Comparator used by the purge job to decide whether a row is expired. */
export function isExpired(
  rowCreatedAt: Date,
  resolved: IResolvedRetention,
  now: Date = new Date()
): boolean {
  if (!Number.isFinite(resolved.retentionDays)) return false;
  const ageMs = now.getTime() - rowCreatedAt.getTime();
  return ageMs > resolved.retentionDays * 86_400_000;
}

/** Suggest a cron expression; called when admins edit retention manually. */
export function suggestCron(retentionDays: number): string {
  if (retentionDays >= 365) return '0 1 * * *';
  if (retentionDays >= 90) return '0 2 * * *';
  return DEFAULT_PURGE_CRON;
}

/** Helper used by the admin UI to list policies without leaking secrets. */
export function listPolicies(): IPlanRetentionPolicy[] {
  return Object.values(PLAN_RETENTION_POLICIES);
}

/** Pure description for audit logs / changelog rows. */
export function describeResolution(resolved: IResolvedRetention): string {
  const days = Number.isFinite(resolved.retentionDays)
    ? `${resolved.retentionDays} day(s)`
    : 'unlimited';
  return `${resolved.tier} tier → ${days} retention, cron=${resolved.purgeCron}${
    resolved.overridden ? ' (override)' : ''
  }`;
}
