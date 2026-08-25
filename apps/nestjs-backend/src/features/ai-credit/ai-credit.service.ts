/**
 * AI credit tracking — Stage 26.
 *
 * Pure helpers for month-bucketed credit accounting:
 *   - monthBucketFromDate:   YYYY-MM string for a wall-clock
 *   - applyEntry:            signed delta for an entry (charge/refund/grant)
 *   - summarizeMonth:        collapsed usage row
 *   - checkAllowance:        pre-flight check against a per-org monthly limit
 *
 * No Prisma here so the math is unit-testable without a database.
 */

import type {
  AiCreditAction,
  IAiCreditCheckInput,
  IAiCreditCheckResult,
  IAiCreditEntry,
  IAiCreditUsageRow,
} from './ai-credit.types';

/** Format a Date as `YYYY-MM` in UTC. */
export function monthBucketFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** "YYYY-MM" → UTC midnight Date for the first instant of that month. */
export function monthBucketToStart(bucket: string): Date {
  const [y, m] = bucket.split('-').map((n) => Number(n));
  if (!y || !m || m < 1 || m > 12) throw new Error('invalid month bucket');
  return new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
}

/** Number of UTC months between two YYYY-MM bucket strings. */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** Signed delta for a single ledger entry. */
export function applyEntry(entry: IAiCreditEntry): number {
  switch (entry.action) {
    case 'charge':
      return -Math.abs(entry.credits);
    case 'refund':
    case 'grant':
      return Math.abs(entry.credits);
  }
}

/** Compute a usage row from a flat list of entries. */
export function summarizeMonth(entries: IAiCreditEntry[], monthBucket: string): IAiCreditUsageRow {
  let consumed = 0;
  let granted = 0;
  let chargeCount = 0;
  for (const e of entries) {
    if (e.monthBucket !== monthBucket) continue;
    if (e.action === 'charge') {
      consumed += Math.abs(e.credits);
      chargeCount++;
    } else {
      granted += Math.abs(e.credits);
    }
  }
  return {
    monthBucket,
    consumed,
    granted,
    net: granted - consumed,
    chargeCount,
  };
}

/** Pre-flight check against an org's monthly limit. */
export function checkAllowance(input: {
  usage: IAiCreditUsageRow;
  estimatedCredits: number;
  limit: number;
}): { allowed: boolean; remaining: number } {
  const remaining = input.limit - input.usage.consumed - input.estimatedCredits;
  return { allowed: remaining >= 0, remaining };
}

/**
 * Convenience: build a check result from already-loaded ledger entries.
 * Useful in tests + the dashboard endpoint.
 */
export function buildCheckResult(
  input: IAiCreditCheckInput & {
    entries: IAiCreditEntry[];
    limit: number;
  }
): IAiCreditCheckResult {
  const monthBucket = input.monthBucket ?? monthBucketFromDate(new Date());
  const usage = summarizeMonth(input.entries, monthBucket);
  const { allowed, remaining } = checkAllowance({
    usage,
    estimatedCredits: input.estimatedCredits,
    limit: input.limit,
  });
  return {
    allowed,
    monthBucket,
    consumed: usage.consumed,
    limit: input.limit,
    remaining,
  };
}

/**
 * Roll over unused credits from the previous month up to `carryCap`.
 * Returns the credit amount to grant. Returns 0 when there is no
 * unused balance or when there's no previous month.
 */
export function computeCarryover(input: {
  currentBucket: string;
  prevUsage: IAiCreditUsageRow;
  prevLimit: number;
  carryCap: number;
}): { previousBucket: string | null; grantCredits: number } {
  const [y, m] = input.currentBucket.split('-').map(Number);
  if (!y || !m) return { previousBucket: null, grantCredits: 0 };
  const prevBucket = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  if (input.prevUsage.monthBucket !== prevBucket) {
    return { previousBucket: null, grantCredits: 0 };
  }
  const unused = Math.max(0, input.prevLimit - input.prevUsage.consumed);
  return { previousBucket: prevBucket, grantCredits: Math.min(unused, input.carryCap) };
}

/** The set of actions recognized by the ledger. */
export const AI_CREDIT_ACTIONS: ReadonlyArray<AiCreditAction> = [
  'charge',
  'refund',
  'grant',
] as const;

/** Coerce a string to a known action, defaulting to 'charge'. */
export function coerceAction(input: string | null | undefined): AiCreditAction {
  if (input === 'refund' || input === 'grant') return input;
  return 'charge';
}
