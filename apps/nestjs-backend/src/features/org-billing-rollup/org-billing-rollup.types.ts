/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Org-level billing rollup — Stage 69.
 *
 * Teable Cloud produces billing events per-base (Stripe subs, AI credits,
 * webhook usage, automation runs, BYOK throughput, etc.). For an org with
 * many bases, the finance team needs a single invoice view that
 * consolidates every chargeable line item, sums credits, and flags
 * accounts that cross dunning thresholds.
 *
 * This module models the consolidation math in pure form so the auth
 * service can compute rollups, persist line items, and notify the
 * billing-runner without coupling to transport.
 *
 * Rollups happen at fixed periods (monthly close, ad-hoc admin view).
 * The shape: a list of per-base `IBillingLineItem` (kind, quantity,
 * unit price, currency) flows into `consolidateLineItems()` which
 * produces an `IBillingRollup` keyed by org + period. Credit notes
 * subtract from the gross; dunning thresholds (e.g. 30/60/90 days past
 * due) escalate the rollup's `IBillingRollup.dunningLevel`.
 */

export type Currency = 'USD' | 'EUR' | 'CNY' | 'JPY' | 'GBP';

export type BillingLineKind =
  | 'subscription'
  | 'ai-credit'
  | 'webhook-delivery'
  | 'automation-run'
  | 'byok-throughput'
  | 'storage-overage'
  | 'seat-addon'
  | 'one-time-fee';

export type DunningLevel = 'current' | 'reminder' | 'past-due-30' | 'past-due-60' | 'past-due-90';

export interface IBillingLineItem {
  id: string;
  orgId: string;
  baseId: string;
  kind: BillingLineKind;
  /** ISO timestamp the charge was incurred. */
  incurredAt: string;
  /** Quantity (seats, runs, MB, tokens, ...). */
  quantity: number;
  /** Per-unit price in minor currency units (cents, pence, fen). */
  unitPriceMinor: number;
  currency: Currency;
  /** Human-readable description shown on the invoice. */
  description: string;
}

export interface IBillingCredit {
  id: string;
  orgId: string;
  /** ISO timestamp the credit was applied. */
  appliedAt: string;
  /** Credit magnitude in minor currency units. */
  amountMinor: number;
  currency: Currency;
  /** Reason / promo code / refund reference. */
  reason: string;
}

export interface IBillingRollup {
  orgId: string;
  /** Period key in YYYY-MM form. */
  period: string;
  currency: Currency;
  /** Sum of line items in minor units. */
  grossMinor: number;
  /** Sum of credits in minor units. */
  creditsMinor: number;
  /** Net payable = gross − credits. */
  netMinor: number;
  /** Count of line items rolled up. */
  lineCount: number;
  /** Count of distinct bases represented. */
  baseCount: number;
  /** Dunning level for this org × period. */
  dunningLevel: DunningLevel;
  /** Per-kind breakdown in minor units. */
  byKind: Record<BillingLineKind, number>;
  /** ISO timestamp the rollup was produced. */
  generatedAt: string;
}

export interface IOrgBillingRollupOptions {
  /** Currency to consolidate into; defaults to first line item. */
  targetCurrency?: Currency;
  /** Test override for "now". */
  now?: string;
  /** Threshold in days for past-due-30. */
  pastDue30Days?: number;
  /** Threshold in days for past-due-60. */
  pastDue60Days?: number;
  /** Threshold in days for past-due-90. */
  pastDue90Days?: number;
}

/** Defaults. */
export const DEFAULT_PAST_DUE_30_DAYS = 30;
export const DEFAULT_PAST_DUE_60_DAYS = 60;
export const DEFAULT_PAST_DUE_90_DAYS = 90;
export const MAX_LINE_ITEMS_PER_ROLLUP = 50_000;
export const MAX_BASES_PER_ORG = 256;
export const MINOR_UNIT_FACTOR: Record<Currency, number> = {
  USD: 100,
  EUR: 100,
  CNY: 100,
  JPY: 1,
  GBP: 100,
};

/** Friendly labels for the rollup card UI. */
export const BILLING_LINE_KIND_LABELS: Record<BillingLineKind, string> = {
  subscription: '订阅费用',
  'ai-credit': 'AI 信用',
  'webhook-delivery': 'Webhook 投递',
  'automation-run': '自动化执行',
  'byok-throughput': 'BYOK 流量',
  'storage-overage': '存储超额',
  'seat-addon': '席位加购',
  'one-time-fee': '一次性费用',
};

export const DUNNING_LEVEL_LABELS: Record<DunningLevel, string> = {
  current: '正常',
  reminder: '提醒',
  'past-due-30': '逾期 30 天',
  'past-due-60': '逾期 60 天',
  'past-due-90': '逾期 90 天',
};
