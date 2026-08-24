import type { PlanLevel, QuotaMetric } from '@teable/db-main-prisma';

export const KB = 1024n;
export const MB = KB * 1024n;
export const GB = MB * 1024n;
export const TB = GB * 1024n;

/**
 * Default hard limits per `PlanLevel`. `null` (or `undefined`) means
 * unlimited. The Cloud pricing page maps to these values; self-host installs
 * default to `null` everywhere so the OSS / Standalone deployment is never
 * artificially capped.
 *
 * Keep these in sync with `https://teable.ai/zh/pricing?host=cloud`.
 */
export interface IPlanLimits {
  rowLimit?: number | null;
  attachmentByteLimit?: bigint | null;
  automationRunLimit?: number | null;
  aiCreditLimit?: number | null;
  apiRequestLimitPerSec?: number | null;
  recordHistoryDays?: number | null;
  automationHistoryDays?: number | null;
  seatLimit?: number | null;
}

export const PLAN_LIMITS: Record<PlanLevel, IPlanLimits> = {
  free: {
    rowLimit: 1_000,
    attachmentByteLimit: 1n * GB,
    automationRunLimit: 100,
    aiCreditLimit: 200,
    apiRequestLimitPerSec: 10,
    recordHistoryDays: 14,
    automationHistoryDays: 14,
    seatLimit: 1,
  },
  pro: {
    rowLimit: 250_000,
    attachmentByteLimit: 10n * GB,
    automationRunLimit: 25_000,
    aiCreditLimit: 1_000,
    apiRequestLimitPerSec: 10,
    recordHistoryDays: 365,
    automationHistoryDays: 365,
    seatLimit: 10,
  },
  business: {
    rowLimit: 1_000_000,
    attachmentByteLimit: 100n * GB,
    automationRunLimit: 100_000,
    aiCreditLimit: 2_000,
    apiRequestLimitPerSec: 10,
    recordHistoryDays: 365 * 3,
    automationHistoryDays: 365,
    seatLimit: 100,
  },
  enterprise: {
    // All null = unlimited; Sales contracts override on a per-deploy basis.
    rowLimit: null,
    attachmentByteLimit: null,
    automationRunLimit: null,
    aiCreditLimit: null,
    apiRequestLimitPerSec: null,
    recordHistoryDays: null,
    automationHistoryDays: null,
    seatLimit: null,
  },
  self_hosted: {
    // OSS / Standalone / Full-featured self-host default: never enforced.
    rowLimit: null,
    attachmentByteLimit: null,
    automationRunLimit: null,
    aiCreditLimit: null,
    apiRequestLimitPerSec: null,
    recordHistoryDays: null,
    automationHistoryDays: null,
    seatLimit: null,
  },
};

/**
 * Map a QuotaMetric enum to the column on `space_quota` it reads from.
 * Single source of truth so callers can't typo `row_limit` vs `rowsLimit`.
 */
export const METRIC_TO_COLUMN: Record<QuotaMetric, keyof IPlanLimits> = {
  rows: 'rowLimit',
  attachment_bytes: 'attachmentByteLimit',
  automation_runs: 'automationRunLimit',
  ai_credits: 'aiCreditLimit',
  api_requests: 'apiRequestLimitPerSec',
  record_history_days: 'recordHistoryDays',
  automation_history_days: 'automationHistoryDays',
  seats: 'seatLimit',
};

/**
 * Metrics that roll up against a calendar-month period. Everything else is
 * either instantaneous (api_requests — per second) or configured as a days
 * ceiling (record_history_days / automation_history_days / seats).
 */
export const PERIODIC_METRICS: ReadonlySet<QuotaMetric> = new Set<QuotaMetric>([
  'rows',
  'attachment_bytes',
  'automation_runs',
  'ai_credits',
]);

/** "no cap" sentinel. -1 is the same convention the Prisma README documents. */
export const UNLIMITED = -1;

export function isUnlimited(value: number | bigint | null | undefined): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'bigint') return value < 0n;
  return value < 0;
}