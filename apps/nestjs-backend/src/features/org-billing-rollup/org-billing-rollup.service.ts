/**
 * Org-level billing rollup — pure helpers (Stage 69).
 */

import type {
  BillingLineKind,
  Currency,
  DunningLevel,
  IBillingCredit,
  IBillingLineItem,
  IBillingRollup,
  IOrgBillingRollupOptions,
} from './org-billing-rollup.types';
import {
  DEFAULT_PAST_DUE_30_DAYS,
  DEFAULT_PAST_DUE_60_DAYS,
  DEFAULT_PAST_DUE_90_DAYS,
  MAX_BASES_PER_ORG,
  MAX_LINE_ITEMS_PER_ROLLUP,
  MINOR_UNIT_FACTOR,
} from './org-billing-rollup.types';

const ALL_KINDS: ReadonlyArray<BillingLineKind> = [
  'subscription',
  'ai-credit',
  'webhook-delivery',
  'automation-run',
  'byok-throughput',
  'storage-overage',
  'seat-addon',
  'one-time-fee',
];

const ALL_CURRENCIES: ReadonlyArray<Currency> = ['USD', 'EUR', 'CNY', 'JPY', 'GBP'];

const ALL_DUNNING: ReadonlyArray<DunningLevel> = [
  'current',
  'reminder',
  'past-due-30',
  'past-due-60',
  'past-due-90',
];

/** Whether the input is a recognized billing line kind. */
export function isLineKind(s: string): s is BillingLineKind {
  return (ALL_KINDS as ReadonlyArray<string>).includes(s);
}

/** Whether the input is a recognized currency. */
export function isCurrency(s: string): s is Currency {
  return (ALL_CURRENCIES as ReadonlyArray<string>).includes(s);
}

/** Whether the input is a recognized dunning level. */
export function isDunningLevel(s: string): s is DunningLevel {
  return (ALL_DUNNING as ReadonlyArray<string>).includes(s);
}

/** Convert a (unit, qty) pair into minor units, rounding half-up. */
export function toMinor(unitPriceMinor: number, quantity: number): number {
  if (!Number.isFinite(unitPriceMinor) || !Number.isFinite(quantity)) return 0;
  if (quantity < 0) return Math.floor(unitPriceMinor * quantity);
  return Math.round(unitPriceMinor * quantity);
}

/** Convert a minor amount into major units using the currency factor. */
export function toMajor(amountMinor: number, currency: Currency): number {
  return amountMinor / MINOR_UNIT_FACTOR[currency];
}

/** Derive the YYYY-MM period key from a timestamp string. */
export function periodKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '1970-01';
  return `${d.getUTCFullYear().toString().padStart(4, '0')}-${(d.getUTCMonth() + 1)
    .toString()
    .padStart(2, '0')}`;
}

/** Validate a line item — returns null if OK, or error string. */
export function validateLineItem(item: IBillingLineItem): string | null {
  if (!item.id) return 'id required';
  if (!item.orgId) return 'orgId required';
  if (!item.baseId) return 'baseId required';
  if (!isLineKind(item.kind)) return `unknown kind: ${item.kind}`;
  if (!isCurrency(item.currency)) return `unknown currency: ${item.currency}`;
  if (typeof item.quantity !== 'number' || item.quantity < 0) return 'quantity must be ≥ 0';
  if (typeof item.unitPriceMinor !== 'number' || item.unitPriceMinor < 0) {
    return 'unitPriceMinor must be ≥ 0';
  }
  return null;
}

/** Decide dunning level based on days past due. */
export function decideDunningLevel(input: {
  daysPastDue: number;
  options?: IOrgBillingRollupOptions;
}): DunningLevel {
  const t30 = input.options?.pastDue30Days ?? DEFAULT_PAST_DUE_30_DAYS;
  const t60 = input.options?.pastDue60Days ?? DEFAULT_PAST_DUE_60_DAYS;
  const t90 = input.options?.pastDue90Days ?? DEFAULT_PAST_DUE_90_DAYS;
  const d = input.daysPastDue;
  if (d >= t90) return 'past-due-90';
  if (d >= t60) return 'past-due-60';
  if (d >= t30) return 'past-due-30';
  if (d > 0) return 'reminder';
  return 'current';
}

/** Sum credits that apply to this org + period, in target currency minor units. */
export function sumCredits(input: {
  credits: IBillingCredit[];
  orgId: string;
  period: string;
  currency: Currency;
}): number {
  return input.credits
    .filter(
      (c) =>
        c.orgId === input.orgId &&
        c.currency === input.currency &&
        periodKey(c.appliedAt) === input.period
    )
    .reduce((acc, c) => acc + c.amountMinor, 0);
}

/** Filter line items down to the org × period × currency we care about. */
export function filterLineItems(input: {
  items: IBillingLineItem[];
  orgId: string;
  period: string;
  currency: Currency;
}): IBillingLineItem[] {
  return input.items.filter(
    (i) =>
      i.orgId === input.orgId &&
      i.currency === input.currency &&
      periodKey(i.incurredAt) === input.period
  );
}

/** Empty by-kind breakdown for a rollup. */
export function emptyByKind(): Record<BillingLineKind, number> {
  const out = {} as Record<BillingLineKind, number>;
  for (const k of ALL_KINDS) out[k] = 0;
  return out;
}

/** Consolidate line items + credits into a single rollup. */
export function consolidateLineItems(input: {
  items: IBillingLineItem[];
  credits: IBillingCredit[];
  orgId: string;
  period: string;
  currency: Currency;
  daysPastDue?: number;
  options?: IOrgBillingRollupOptions;
  now?: string;
}): IBillingRollup {
  const items = filterLineItems({
    items: input.items,
    orgId: input.orgId,
    period: input.period,
    currency: input.currency,
  });
  const byKind = emptyByKind();
  let gross = 0;
  const baseIds = new Set<string>();
  for (const it of items) {
    const lineTotal = toMinor(it.unitPriceMinor, it.quantity);
    byKind[it.kind] += lineTotal;
    gross += lineTotal;
    baseIds.add(it.baseId);
  }
  const credits = sumCredits({
    credits: input.credits,
    orgId: input.orgId,
    period: input.period,
    currency: input.currency,
  });
  const net = Math.max(0, gross - credits);
  const dunning =
    input.daysPastDue !== undefined
      ? decideDunningLevel({
          daysPastDue: input.daysPastDue,
          ...(input.options ? { options: input.options } : {}),
        })
      : 'current';
  return {
    orgId: input.orgId,
    period: input.period,
    currency: input.currency,
    grossMinor: gross,
    creditsMinor: credits,
    netMinor: net,
    lineCount: items.length,
    baseCount: Math.min(MAX_BASES_PER_ORG, baseIds.size),
    dunningLevel: dunning,
    byKind,
    generatedAt: input.now ?? new Date().toISOString(),
  };
}

/** Produce rollups for every org × period × currency that has data. */
export function rollupAllOrgs(input: {
  items: IBillingLineItem[];
  credits: IBillingCredit[];
  options?: IOrgBillingRollupOptions;
  now?: string;
}): IBillingRollup[] {
  const orgIds = new Set(input.items.map((i) => i.orgId));
  const periods = new Set(input.items.map((i) => periodKey(i.incurredAt)));
  const currencies = new Set(input.items.map((i) => i.currency));
  const out: IBillingRollup[] = [];
  for (const org of orgIds) {
    for (const period of periods) {
      for (const currency of currencies) {
        out.push(
          consolidateLineItems({
            items: input.items,
            credits: input.credits,
            orgId: org,
            period,
            currency,
            ...(input.options ? { options: input.options } : {}),
            ...(input.now ? { now: input.now } : {}),
          })
        );
      }
    }
  }
  return out;
}

/** Whether the rollup represents an empty period. */
export function isEmptyRollup(r: IBillingRollup): boolean {
  return r.lineCount === 0 && r.creditsMinor === 0 && r.grossMinor === 0;
}

/** Whether the rollup crosses the line-item cap (sanity guard). */
export function exceedsCap(input: {
  items: IBillingLineItem[];
  orgId: string;
  period: string;
}): boolean {
  const count = input.items.filter(
    (i) => i.orgId === input.orgId && periodKey(i.incurredAt) === input.period
  ).length;
  return count > MAX_LINE_ITEMS_PER_ROLLUP;
}

export const testHelpers = {
  ALL_KINDS,
  ALL_CURRENCIES,
  ALL_DUNNING,
};
