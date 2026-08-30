/**
 * Record-history retention by plan tier — Stage 59.
 *
 * Binds the existing Stage 11/20 retention machinery to a per-plan
 * policy. The pure resolver turns a subscriber context + retention
 * override into a concrete `{retentionDays, purgeCron, maxRecords}`
 * tuple that callers (record-history, audit-log, backup) can
 * directly consume.
 */

export type PlanTier = 'self_hosted' | 'free' | 'pro' | 'business' | 'enterprise';

export interface IPlanRetentionPolicy {
  tier: PlanTier;
  /** How long a history record is kept, in days. */
  retentionDays: number;
  /** Cron expression for the daily purge job. */
  purgeCron: string;
  /** Soft cap on records retained per base (0 = unlimited). */
  maxRecordsPerBase: number;
  /** Human-readable description for admin UIs. */
  description: string;
}

export interface ISubscriberContext {
  /** Plan tier resolved from the subscription / license. */
  tier: PlanTier;
  /** Optional override in days; when present and `> 0`, replaces tier default. */
  overrideDays?: number;
  /** When true, forces unlimited retention regardless of tier. */
  enterpriseOverride?: boolean;
}

export interface IResolvedRetention {
  tier: PlanTier;
  retentionDays: number;
  purgeCron: string;
  maxRecordsPerBase: number;
  /** True when the override / enterprise flag actively extended retention. */
  overridden: boolean;
}

export interface IRetentionQueryResult {
  baseId: string;
  resolved: IResolvedRetention;
  /** Approximate cutoff the purge job will use (`now - retentionDays`). */
  purgeBefore: string;
}
