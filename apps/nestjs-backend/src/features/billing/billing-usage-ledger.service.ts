/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — unified usage ledger (Phase 5.5 part 1, Stage 87).
 *
 * Append-only event log of metered consumption. Every billable feature
 * (AI credits, automation runs, record overage, storage growth, email
 * sends) calls `recordUsage` with a stable `metric` label. Reads
 * (`aggregate` / `previewOverage`) sum events inside a billing period
 * and compute the cents the customer owes.
 *
 * Why a single ledger instead of separate per-feature tables:
 *   - The Customer Portal already needs one query to render "current
 *     period usage" — a UNION across five tables would be slower and
 *     harder to evolve.
 *   - Calibration (admin fixes historical data) and quota enforcement
 *     become uniform operations on one row shape.
 *   - Future metered products (SMS, fax, ...) drop in without a
 *     migration: just use a new `metric` label.
 *
 * Idempotency: `(organizationId, idempotencyKey)` is unique. Workers
 * can call `recordUsage` from at-least-once contexts without double
 * charging — duplicate writes return the existing row instead of
 * throwing.
 *
 * Period model: events store the billing period explicitly (the
 * caller resolves "what period am I in" via the subscription). This
 * keeps writes append-only and decoupled from any retroactive
 * subscription changes.
 *
 * License: AGPL-3.0
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@teable/db-main-prisma';
import { PrismaService } from '@teable/db-main-prisma';

export type BillingUsageMetric =
  | 'ai_credits'
  | 'automation_runs'
  | 'records'
  | 'storage_bytes'
  | 'email_sends';

export interface IRecordUsageInput {
  organizationId: string;
  metric: BillingUsageMetric;
  quantity: number | bigint;
  periodStart: Date;
  periodEnd: Date;
  /** Source feature that produced the event, e.g. "ai-chat". */
  source: string;
  /** Optional worker / API request id for dedup. */
  idempotencyKey?: string;
  /** Free-form forensic metadata (token counts, attachment ids, ...). */
  metadata?: Record<string, unknown>;
  /** Override for deterministic tests. Defaults to `new Date()`. */
  recordedAt?: Date;
}

export interface IUsageEvent {
  id: string;
  organizationId: string;
  metric: BillingUsageMetric;
  quantity: bigint;
  periodStart: Date;
  periodEnd: Date;
  source: string;
  idempotencyKey: string | null;
  metadata: unknown;
  recordedAt: Date;
}

export interface IAggregateInput {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  metric?: BillingUsageMetric;
}

export interface IAggregateResult {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  metric: BillingUsageMetric | 'all';
  totalQuantity: bigint;
  eventCount: number;
}

export interface IOverageTier {
  /** Inclusive lower bound of usage units covered by this tier. */
  threshold: number | bigint;
  /** Cents per single unit consumed inside this tier. */
  unitCents: number;
}

export interface IPreviewOverageInput {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  metric: BillingUsageMetric;
  /** Usage units included in the base plan (no charge). */
  includedQuantity: number | bigint;
  /**
   * Tiers, sorted by `threshold` ascending. The first tier covers
   * usage from `includedQuantity` (exclusive of included) up to its
   * own threshold (inclusive); subsequent tiers apply from the
   * previous threshold (exclusive) onward. Example:
   *   [{ threshold: 1000, unitCents: 1 }, { threshold: 5000, unitCents: 0.5 }]
   * means units 1001–5000 cost 1¢ each and 5001+ cost 0.5¢ each.
   */
  tiers: ReadonlyArray<IOverageTier>;
  /** Currency code; defaults to `usd`. */
  currency?: string;
}

export interface IOveragePreview {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  metric: BillingUsageMetric;
  totalQuantity: bigint;
  includedQuantity: bigint;
  overageQuantity: bigint;
  overageCents: number;
  currency: string;
  tierBreakdown: Array<{
    fromInclusive: bigint;
    toInclusive: bigint;
    unitCents: number;
    units: bigint;
    cents: number;
  }>;
}

const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

@Injectable()
export class BillingUsageLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Append a usage event. Idempotent when `idempotencyKey` is supplied:
   * a duplicate call returns the existing row instead of inserting a
   * second one. Throws on negative or non-finite quantity.
   */
  async recordUsage(input: IRecordUsageInput): Promise<IUsageEvent> {
    if (!input.organizationId) throw new Error('organizationId is required');
    if (!input.metric) throw new Error('metric is required');
    if (!input.source) throw new Error('source is required');
    if (!input.periodStart || !input.periodEnd) {
      throw new Error('periodStart and periodEnd are required');
    }
    if (input.periodEnd.getTime() <= input.periodStart.getTime()) {
      throw new Error('periodEnd must be strictly after periodStart');
    }
    const quantity = typeof input.quantity === 'bigint'
      ? input.quantity
      : BigInt(Math.trunc(input.quantity));
    if (quantity < 0n) {
      throw new Error(`quantity must be non-negative, got ${quantity}`);
    }
    if (quantity === 0n) {
      // Zero-quantity events are not useful; return a sentinel without
      // writing so callers don't accumulate dead rows.
      return {
        id: 'noop',
        organizationId: input.organizationId,
        metric: input.metric,
        quantity: 0n,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        source: input.source,
        idempotencyKey: input.idempotencyKey ?? null,
        metadata: input.metadata ?? null,
        recordedAt: input.recordedAt ?? new Date(),
      };
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.billingUsageEvent.findFirst({
        where: {
          organizationId: input.organizationId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) return toEvent(existing);
    }

    const id = newId('usgev');
    try {
      const created = await this.prisma.billingUsageEvent.create({
        data: {
          id,
          organizationId: input.organizationId,
          metric: input.metric,
          quantity,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          source: input.source,
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
          ...(input.metadata !== undefined
            ? { metadata: input.metadata as Prisma.InputJsonValue }
            : {}),
          ...(input.recordedAt ? { recordedAt: input.recordedAt } : {}),
        },
      });
      return toEvent(created);
    } catch (err) {
      // Race: another writer won the idempotency-key slot between our
      // findFirst and create. Re-read and return the winner.
      if (
        input.idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.billingUsageEvent.findFirst({
          where: {
            organizationId: input.organizationId,
            idempotencyKey: input.idempotencyKey,
          },
        });
        if (existing) return toEvent(existing);
      }
      throw err;
    }
  }

  /**
   * Sum quantities for an organization inside a billing period, optionally
   * filtered to a single metric. Returns `{ totalQuantity, eventCount }`.
   * The aggregation uses `findMany` because per-row sums let callers
   * also expose a per-source breakdown later; for very large tenants
   * the read path can swap to `groupBy` without changing the contract.
   */
  async aggregate(input: IAggregateInput): Promise<IAggregateResult> {
    if (!input.organizationId) throw new Error('organizationId is required');
    if (input.periodEnd.getTime() <= input.periodStart.getTime()) {
      throw new Error('periodEnd must be strictly after periodStart');
    }
    const rows = await this.prisma.billingUsageEvent.findMany({
      where: {
        organizationId: input.organizationId,
        periodStart: { gte: input.periodStart },
        periodEnd: { lte: input.periodEnd },
        ...(input.metric ? { metric: input.metric } : {}),
      },
      select: { quantity: true, metric: true },
    });
    let total = 0n;
    for (const row of rows) {
      total += row.quantity;
    }
    return {
      organizationId: input.organizationId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      metric: input.metric ?? 'all',
      totalQuantity: total,
      eventCount: rows.length,
    };
  }

  /**
   * Preview the overage charge for one metric inside a billing period.
   * Pure math on top of `aggregate` — no writes. Used by the Customer
   * Portal before a plan change so the customer sees the exact cents
   * they would owe.
   */
  async previewOverage(input: IPreviewOverageInput): Promise<IOveragePreview> {
    const agg = await this.aggregate({
      organizationId: input.organizationId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      metric: input.metric,
    });
    const included = toBig(input.includedQuantity);
    const total = agg.totalQuantity;
    const overage = total > included ? total - included : 0n;

    const breakdown = computeTierBreakdown(overage, input.tiers, included);
    const overageCents = breakdown.reduce((acc, tier) => acc + tier.cents, 0);

    return {
      organizationId: input.organizationId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      metric: input.metric,
      totalQuantity: total,
      includedQuantity: included,
      overageQuantity: overage,
      overageCents,
      currency: input.currency ?? 'usd',
      tierBreakdown: breakdown,
    };
  }

  /**
   * Admin / support helper. Manually upsert a usage row to fix a
   * historical over-count or under-count. Returns the new row. Use
   * sparingly — the write side is supposed to be append-only.
   */
  async calibrate(input: {
    eventId: string;
    quantity: number | bigint;
    metadata?: Record<string, unknown>;
  }): Promise<IUsageEvent | null> {
    const quantity = typeof input.quantity === 'bigint'
      ? input.quantity
      : BigInt(Math.trunc(input.quantity));
    if (quantity < 0n) {
      throw new Error(`calibrate quantity must be non-negative, got ${quantity}`);
    }
    const existing = await this.prisma.billingUsageEvent.findUnique({
      where: { id: input.eventId },
    });
    if (!existing) return null;
    const updated = await this.prisma.billingUsageEvent.update({
      where: { id: input.eventId },
      data: {
        quantity,
        ...(input.metadata !== undefined
          ? { metadata: input.metadata as Prisma.InputJsonValue }
          : {}),
      },
    });
    return toEvent(updated);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────

function toBig(n: number | bigint): bigint {
  return typeof n === 'bigint' ? n : BigInt(Math.trunc(n));
}

function toEvent(r: {
  id: string;
  organizationId: string;
  metric: string;
  quantity: bigint;
  periodStart: Date;
  periodEnd: Date;
  source: string;
  idempotencyKey: string | null;
  metadata: unknown;
  recordedAt: Date;
}): IUsageEvent {
  return {
    id: r.id,
    organizationId: r.organizationId,
    metric: r.metric as BillingUsageMetric,
    quantity: r.quantity,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    source: r.source,
    idempotencyKey: r.idempotencyKey,
    metadata: r.metadata,
    recordedAt: r.recordedAt,
  };
}

/**
 * Distribute `overage` units across the supplied tiers. `includedQuantity`
 * is the boundary the base plan covers; tier indexing starts at
 * `includedQuantity + 1` so tier 0 covers the band just above the
 * included quantity up to its own threshold (inclusive).
 *
 * Example: `includedQuantity = 1000`, `total = 5500`, `overage = 4500`,
 * `tiers = [{threshold: 5000, unitCents: 1}, {threshold: 10000, unitCents: 0.5}]`
 *   - tier 0: 4000 units (1001–5000) × 1¢ = 4000¢
 *   - tier 1: 500 units (5001–10000) × 0.5¢ = 250¢
 *   - total: 4250¢
 *
 * Without a final `+Infinity` tier, units beyond the last threshold are
 * not charged. Callers wanting unbounded tail usage should pass a
 * sentinel tier like `{ threshold: Number.MAX_SAFE_INTEGER, unitCents: 0.5 }`.
 */
function computeTierBreakdown(
  overage: bigint,
  tiers: ReadonlyArray<IOverageTier>,
  includedQuantity: bigint
): IOveragePreview['tierBreakdown'] {
  const breakdown: IOveragePreview['tierBreakdown'] = [];
  if (overage === 0n || tiers.length === 0) return breakdown;
  const sortedTiers = [...tiers].sort(
    (a, b) => Number(toBig(a.threshold) - toBig(b.threshold))
  );
  let lowerBound = includedQuantity; // exclusive lower bound for the current tier
  let remaining = overage;
  for (let i = 0; i < sortedTiers.length; i += 1) {
    if (remaining === 0n) break;
    const tier = sortedTiers[i]!;
    const upperBound = toBig(tier.threshold);
    const tierCapacity = upperBound - lowerBound;
    if (tierCapacity <= 0n) {
      lowerBound = upperBound;
      continue;
    }
    const unitsInTier = remaining < tierCapacity ? remaining : tierCapacity;
    const cents = Math.round(Number(unitsInTier) * tier.unitCents);
    breakdown.push({
      fromInclusive: lowerBound + 1n,
      toInclusive: upperBound,
      unitCents: tier.unitCents,
      units: unitsInTier,
      cents,
    });
    lowerBound = upperBound;
    remaining -= unitsInTier;
  }
  return breakdown;
}
