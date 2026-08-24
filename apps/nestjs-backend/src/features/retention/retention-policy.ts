import type { PlanLevel } from '@teable/db-main-prisma';

/**
 * The two cleanup kinds Stage 11 wires into per-plan TTLs.
 * - `record`     : `record_history` (write-buffer flush + delete cutoff)
 * - `automation` : `automation_run`  (cleanup stub; real table not in OSS)
 */
export type RetentionKind = 'record' | 'automation';

/** PlanLevel union narrowed to the surface Stage 11 reads from. */
export type RetentionPlan = PlanLevel;

export const MS_PER_DAY = 86_400_000;

/**
 * Per-plan, per-kind TTLs in days. Mirrors the teable Cloud pricing page
 * (https://teable.ai/zh/pricing?host=cloud) and the supervisor spec §3.7.
 *
 *   record:     self_hosted=14, free=14, pro=365, business=1095, enterprise=1095
 *   automation: self_hosted=14, free=14, pro=365, business=365,  enterprise=365
 *
 * Enterprise is not in the public pricing matrix but is contractually
 * "at least business"; giving it the same ceiling keeps cleanup from
 * pre-empting a paid customer's history.
 */
const RETENTION_DAYS: Record<RetentionPlan, Record<RetentionKind, number>> = {
  self_hosted: { record: 14, automation: 14 },
  free: { record: 14, automation: 14 },
  pro: { record: 365, automation: 365 },
  business: { record: 1095, automation: 365 },
  enterprise: { record: 1095, automation: 365 },
};

/** Conservative fallback for unknown plan / unknown kind: 14 days. */
export const DEFAULT_RETENTION_DAYS = 14;

/**
 * Resolve the retention TTL (in days) for a (plan, kind) pair.
 *
 * The function is total: any input that is not a known `RetentionPlan` /
 * `RetentionKind` returns `DEFAULT_RETENTION_DAYS`. This is intentional —
 * callers (the record-history-cold processor, the automation-run cleanup
 * stub) run on every pod and must never throw on a misconfigured plan.
 */
export function getRetentionDaysForPlan(plan: RetentionPlan, kind: RetentionKind): number {
  const byPlan = (RETENTION_DAYS as Record<string, Record<string, number> | undefined>)[plan];
  const days = byPlan?.[kind];
  return typeof days === 'number' ? days : DEFAULT_RETENTION_DAYS;
}

/** Convenience wrapper: TTL expressed as epoch-ms offset suitable for
 *  `IColdFlushOptions.horizonMs` / any "cutoff = now - ttl" arithmetic. */
export function getRetentionMsForPlan(plan: RetentionPlan, kind: RetentionKind): number {
  return getRetentionDaysForPlan(plan, kind) * MS_PER_DAY;
}

/** Pure parse: drop `RetentionPlan` typing without losing the fallback. */
export function getRetentionDaysForPlanLike(plan: string, kind: string): number {
  return getRetentionDaysForPlan(plan as RetentionPlan, kind as RetentionKind);
}
