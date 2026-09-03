/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — add-on subscriptions (Phase 5.5 part 2, Stage 88).
 *
 * Manages pack-style add-ons a customer stacks on top of their base
 * plan: extra AI credits, automation runs, record overage allowance,
 * storage GB. Each active row grants a fixed monthly quantity and
 * bills a fixed monthly price in cents.
 *
 * Relationship with the ledger:
 *   `BillingUsageLedgerService.previewOverage` accepts an
 *   `includedQuantity` per metric. The overage preview endpoint reads
 *   the sum of `grantedQuantity` across active add-ons for the org +
 *   metric, then passes that as `includedQuantity`. Net effect:
 *   add-ons *reduce* the overage the customer is charged for.
 *
 * Lifecycle:
 *   - `activate(input)`           — create an `active` row for the
 *                                   current period (idempotent on
 *                                   (org, packCode, periodStart)).
 *   - `cancel(input)`             — atPeriodEnd=true marks the row
 *                                   `canceled` but keeps it valid for
 *                                   the rest of the current period;
 *                                   atPeriodEnd=false flips immediately.
 *   - `expireDue(input)`          — worker sweep: rows whose
 *                                   `currentPeriodEnd <= now` flip to
 *                                   `expired`. Idempotent.
 *   - `previewMonthlyCost(input)` — sum of `monthlyPriceCents` across
 *                                   active rows for the org.
 *
 * License: AGPL-3.0
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import type { BillingUsageMetric } from './billing-usage-ledger.service';

export type AddOnMetric = Exclude<BillingUsageMetric, 'email_sends'>;

export type AddOnStatus = 'active' | 'canceled' | 'expired';

export interface IAddOnDescriptor {
  packCode: string;
  metric: AddOnMetric;
  grantedQuantity: number | bigint;
  monthlyPriceCents: number;
  currency?: string;
}

export interface IAddOn {
  id: string;
  organizationId: string;
  metric: AddOnMetric;
  packCode: string;
  grantedQuantity: bigint;
  monthlyPriceCents: number;
  currency: string;
  status: AddOnStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  canceledAt: Date | null;
  createdTime: Date;
  updatedTime: Date;
}

export interface IActivateAddOnInput {
  organizationId: string;
  descriptor: IAddOnDescriptor;
  /** Defaults to now(). */
  periodStart?: Date;
  /** Defaults to periodStart + 30 days (caller can pass subscription period). */
  periodEnd?: Date;
}

export interface ICancelAddOnInput {
  organizationId: string;
  packCode: string;
  atPeriodEnd: boolean;
  /** Wall-clock for deterministic tests. */
  asOf?: Date;
}

export interface IExpireDueInput {
  asOf?: Date;
  /** Cap on rows processed per call; defaults to 200. */
  limit?: number;
}

export interface IPreviewMonthlyCostInput {
  organizationId: string;
  asOf?: Date;
}

export interface IPreviewMonthlyCostResult {
  organizationId: string;
  totalCents: number;
  currency: string;
  activeCount: number;
  addOns: Array<{
    packCode: string;
    metric: AddOnMetric;
    monthlyPriceCents: number;
    currency: string;
  }>;
}

const DEFAULT_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

@Injectable()
export class BillingAddOnService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Activate an add-on for the current billing period. Idempotent on
   * `(organizationId, packCode, periodStart)` so retries from a
   * worker return the existing row instead of double-charging.
   */
  async activate(input: IActivateAddOnInput): Promise<IAddOn> {
    if (!input.organizationId) throw new Error('organizationId is required');
    if (!input.descriptor?.packCode) throw new Error('packCode is required');
    if (!input.descriptor?.metric) throw new Error('metric is required');
    if (input.descriptor.grantedQuantity < 0) {
      throw new Error('grantedQuantity must be non-negative');
    }
    if (input.descriptor.monthlyPriceCents < 0) {
      throw new Error('monthlyPriceCents must be non-negative');
    }

    const periodStart = input.periodStart ?? new Date();
    const periodEnd =
      input.periodEnd ?? new Date(periodStart.getTime() + DEFAULT_PERIOD_MS);

    const existing = await this.prisma.billingAddOn.findFirst({
      where: {
        organizationId: input.organizationId,
        packCode: input.descriptor.packCode,
        currentPeriodStart: periodStart,
      },
    });
    if (existing) return toAddOn(existing);

    const id = newId('addon');
    try {
      const created = await this.prisma.billingAddOn.create({
        data: {
          id,
          organizationId: input.organizationId,
          metric: input.descriptor.metric,
          packCode: input.descriptor.packCode,
          grantedQuantity: toBig(input.descriptor.grantedQuantity),
          monthlyPriceCents: input.descriptor.monthlyPriceCents,
          currency: input.descriptor.currency ?? 'usd',
          status: 'active',
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });
      return toAddOn(created);
    } catch (err) {
      // Race: another writer created the same (org, pack, periodStart)
      // tuple between our findFirst and create. Re-read.
      const code = (err as { code?: string }).code;
      if (code === 'P2002') {
        const winner = await this.prisma.billingAddOn.findFirst({
          where: {
            organizationId: input.organizationId,
            packCode: input.descriptor.packCode,
            currentPeriodStart: periodStart,
          },
        });
        if (winner) return toAddOn(winner);
      }
      throw err;
    }
  }

  /**
   * Cancel an active add-on. `atPeriodEnd=true` flips the row to
   * `canceled` but the granted quantity still counts for the current
   * period; `atPeriodEnd=false` flips immediately and the row no
   * longer contributes to overage inclusion.
   */
  async cancel(input: ICancelAddOnInput): Promise<IAddOn | null> {
    if (!input.organizationId) throw new Error('organizationId is required');
    if (!input.packCode) throw new Error('packCode is required');

    const asOf = input.asOf ?? new Date();
    const active = await this.prisma.billingAddOn.findFirst({
      where: {
        organizationId: input.organizationId,
        packCode: input.packCode,
        status: 'active',
      },
      orderBy: { currentPeriodStart: 'desc' },
    });
    if (!active) return null;

    if (input.atPeriodEnd) {
      const updated = await this.prisma.billingAddOn.update({
        where: { id: active.id },
        data: { status: 'canceled', canceledAt: asOf },
      });
      return toAddOn(updated);
    }
    // Immediate: flip straight to expired so it never counts for any
    // future aggregation either.
    const updated = await this.prisma.billingAddOn.update({
      where: { id: active.id },
      data: { status: 'expired', canceledAt: asOf },
    });
    return toAddOn(updated);
  }

  /**
   * Worker sweep: flip `active` rows whose `currentPeriodEnd <= asOf`
   * to `expired`. Idempotent — re-runs are a no-op. Returns the count
   * of rows transitioned.
   */
  async expireDue(input: IExpireDueInput = {}): Promise<number> {
    const asOf = input.asOf ?? new Date();
    const limit = Math.min(input.limit ?? 200, 1000);
    const candidates = await this.prisma.billingAddOn.findMany({
      where: { status: 'active', currentPeriodEnd: { lte: asOf } },
      take: limit,
      select: { id: true },
    });
    if (candidates.length === 0) return 0;
    const result = await this.prisma.billingAddOn.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { status: 'expired' },
    });
    return result.count;
  }

  /**
   * Sum of `monthlyPriceCents` across all `active` add-ons for an
   * organization. Returned in the dominant currency among the rows
   * (assumed USD-only for OSS; Cloud may need multi-currency sums).
   */
  async previewMonthlyCost(
    input: IPreviewMonthlyCostInput
  ): Promise<IPreviewMonthlyCostResult> {
    if (!input.organizationId) throw new Error('organizationId is required');
    const rows = await this.prisma.billingAddOn.findMany({
      where: { organizationId: input.organizationId, status: 'active' },
      orderBy: { createdTime: 'asc' },
    });
    let totalCents = 0;
    let currency = 'usd';
    for (const row of rows) {
      totalCents += row.monthlyPriceCents;
      currency = row.currency;
    }
    return {
      organizationId: input.organizationId,
      totalCents,
      currency,
      activeCount: rows.length,
      addOns: rows.map((row) => ({
        packCode: row.packCode,
        metric: row.metric as AddOnMetric,
        monthlyPriceCents: row.monthlyPriceCents,
        currency: row.currency,
      })),
    };
  }

  /**
   * Sum `grantedQuantity` across all `active` add-ons for one
   * `(organizationId, metric)` pair. Used by the overage preview to
   * compute effective `includedQuantity`.
   */
  async totalGrantedQuantity(input: {
    organizationId: string;
    metric: AddOnMetric;
    asOf?: Date;
  }): Promise<bigint> {
    const asOf = input.asOf ?? new Date();
    const rows = await this.prisma.billingAddOn.findMany({
      where: {
        organizationId: input.organizationId,
        metric: input.metric,
        status: 'active',
        currentPeriodStart: { lte: asOf },
        currentPeriodEnd: { gt: asOf },
      },
      select: { grantedQuantity: true },
    });
    let total = 0n;
    for (const row of rows) {
      total += row.grantedQuantity;
    }
    return total;
  }

  /** List add-ons (all statuses) for an organization. */
  async listForOrg(input: { organizationId: string }): Promise<IAddOn[]> {
    const rows = await this.prisma.billingAddOn.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { createdTime: 'desc' },
    });
    return rows.map(toAddOn);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────

function toBig(n: number | bigint): bigint {
  return typeof n === 'bigint' ? n : BigInt(Math.trunc(n));
}

function toAddOn(r: {
  id: string;
  organizationId: string;
  metric: string;
  packCode: string;
  grantedQuantity: bigint;
  monthlyPriceCents: number;
  currency: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  canceledAt: Date | null;
  createdTime: Date;
  updatedTime: Date;
}): IAddOn {
  return {
    id: r.id,
    organizationId: r.organizationId,
    metric: r.metric as AddOnMetric,
    packCode: r.packCode,
    grantedQuantity: r.grantedQuantity,
    monthlyPriceCents: r.monthlyPriceCents,
    currency: r.currency,
    status: r.status as AddOnStatus,
    currentPeriodStart: r.currentPeriodStart,
    currentPeriodEnd: r.currentPeriodEnd,
    canceledAt: r.canceledAt,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}
