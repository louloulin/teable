/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — metered invoice writer (Phase 5.5 part 3, Stage 89).
 *
 * Bridges the unified usage ledger (`BillingUsageLedgerService`) and
 * add-on subscriptions (`BillingAddOnService`) into the existing
 * Invoice table. Called by the customer portal's "preview upcoming
 * invoice" endpoint (read-only, idempotent) and by the period-end
 * cron (write side, produces a draft invoice row).
 *
 * Read path (`previewMeteredInvoice`):
 *   1. For each metered metric (`ai_credits`, `automation_runs`,
 *      `records`, `storage_bytes`):
 *      a. Sum the period's events via `usageLedger.aggregate`.
 *      b. Add up `grantedQuantity` from active add-ons via
 *         `billingAddOn.totalGrantedQuantity`.
 *      c. Compute overage via `usageLedger.previewOverage`.
 *   2. Sum the overage cents + monthly add-on price → one line item
 *      per metric in the preview.
 *
 * Write path (`materializeMeteredInvoice`):
 *   1. Run the preview to compute totals.
 *   2. Idempotently create a single draft Invoice row whose amount is
 *      the sum of all metric overages. The `externalInvoiceId` is
 *      deterministic (`metered:<orgId>:<periodStart-iso>`) so retries
 *      return the existing row.
 *
 * License: AGPL-3.0
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { BillingAddOnService, type AddOnMetric } from './billing-add-on.service';
import {
  BillingUsageLedgerService,
  type BillingUsageMetric,
  type IOverageTier,
  type IOveragePreview,
} from './billing-usage-ledger.service';

export interface IMetricRateCard {
  metric: AddOnMetric;
  includedQuantity: number | bigint;
  tiers: ReadonlyArray<IOverageTier>;
}

export interface IPreviewMeteredInvoiceInput {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  rateCards: ReadonlyArray<IMetricRateCard>;
  asOf?: Date;
  /** Currency override; defaults to 'usd'. */
  currency?: string;
}

export interface IMetricLinePreview {
  metric: AddOnMetric;
  totalQuantity: bigint;
  addonGrantedQuantity: bigint;
  includedQuantity: bigint;
  overageQuantity: bigint;
  overageCents: number;
  currency: string;
  tierBreakdown: IOveragePreview['tierBreakdown'];
}

export interface IPreviewMeteredInvoiceResult {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  metrics: IMetricLinePreview[];
  totalCents: number;
  addonMonthlyCostCents: number;
  grandTotalCents: number;
}

export interface IMaterializeMeteredInvoiceInput {
  organizationId: string;
  subscriptionId: string;
  periodStart: Date;
  periodEnd: Date;
  rateCards: ReadonlyArray<IMetricRateCard>;
  asOf?: Date;
  /** Override currency; defaults to the dominant ledger currency. */
  currency?: string;
  /** Override externalInvoiceId; defaults to `metered:<org>:<periodStart-iso>`. */
  externalInvoiceId?: string;
}

export interface IMaterializeMeteredInvoiceResult {
  invoice: {
    id: string;
    externalInvoiceId: string;
    amountCents: number;
    currency: string;
    status: 'draft';
    periodStart: Date;
    periodEnd: Date;
  };
  preview: IPreviewMeteredInvoiceResult;
  created: boolean;
}

const DEFAULT_CURRENCY = 'usd';
const newId = (prefix: string): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

@Injectable()
export class BillingMeteredInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usageLedger: BillingUsageLedgerService,
    private readonly billingAddOn: BillingAddOnService
  ) {}

  /**
   * Pure read. Used by the Customer Portal to render "current period
   * overage" and by the period-end worker before it decides whether
   * to write a draft invoice.
   */
  async previewMeteredInvoice(
    input: IPreviewMeteredInvoiceInput
  ): Promise<IPreviewMeteredInvoiceResult> {
    if (!input.organizationId) throw new Error('organizationId is required');
    if (input.periodEnd.getTime() <= input.periodStart.getTime()) {
      throw new Error('periodEnd must be strictly after periodStart');
    }
    const asOf = input.asOf ?? new Date();
    const metrics: IMetricLinePreview[] = [];
    let totalCents = 0;
    let currency = input.currency ?? DEFAULT_CURRENCY;

    for (const card of input.rateCards) {
      const agg = await this.usageLedger.aggregate({
        organizationId: input.organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        metric: card.metric as BillingUsageMetric,
      });
      const addonGranted = await this.billingAddOn.totalGrantedQuantity({
        organizationId: input.organizationId,
        metric: card.metric,
        asOf,
      });
      const included =
        typeof card.includedQuantity === 'bigint'
          ? card.includedQuantity
          : BigInt(card.includedQuantity);
      const effectiveIncluded = included + addonGranted;
      const overage = await this.usageLedger.previewOverage({
        organizationId: input.organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        metric: card.metric as BillingUsageMetric,
        includedQuantity: effectiveIncluded,
        tiers: card.tiers,
        currency,
      });
      metrics.push({
        metric: card.metric,
        totalQuantity: agg.totalQuantity,
        addonGrantedQuantity: addonGranted,
        includedQuantity: effectiveIncluded,
        overageQuantity: overage.overageQuantity,
        overageCents: overage.overageCents,
        currency: overage.currency,
        tierBreakdown: overage.tierBreakdown,
      });
      totalCents += overage.overageCents;
      currency = overage.currency;
    }

    const addonMonthly = await this.billingAddOn.previewMonthlyCost({
      organizationId: input.organizationId,
      asOf,
    });

    return {
      organizationId: input.organizationId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      currency,
      metrics,
      totalCents,
      addonMonthlyCostCents: addonMonthly.totalCents,
      grandTotalCents: totalCents + addonMonthly.totalCents,
    };
  }

  /**
   * Write a draft invoice for the period. Idempotent on
   * `externalInvoiceId` so the worker can call this freely without
   * risk of double-billing. Returns `{ created: false }` if the
   * invoice already exists.
   */
  async materializeMeteredInvoice(
    input: IMaterializeMeteredInvoiceInput
  ): Promise<IMaterializeMeteredInvoiceResult> {
    if (!input.organizationId) throw new Error('organizationId is required');
    if (!input.subscriptionId) throw new Error('subscriptionId is required');

    const externalInvoiceId =
      input.externalInvoiceId ??
      `metered:${input.organizationId}:${input.periodStart.toISOString()}`;

    const existing = await this.prisma.invoice.findUnique({
      where: { externalInvoiceId },
    });
    if (existing) {
      const preview = await this.previewMeteredInvoice(input);
      return {
        invoice: toInvoiceRow(existing),
        preview,
        created: false,
      };
    }

    const preview = await this.previewMeteredInvoice(input);
    if (preview.grandTotalCents === 0) {
      // Nothing to bill — return a sentinel without writing a row.
      return {
        invoice: {
          id: 'noop',
          externalInvoiceId,
          amountCents: 0,
          currency: preview.currency,
          status: 'draft',
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
        },
        preview,
        created: false,
      };
    }

    const id = newId('inv');
    const created = await this.prisma.invoice.create({
      data: {
        id,
        subscriptionId: input.subscriptionId,
        externalInvoiceId,
        amountCents: preview.grandTotalCents,
        currency: preview.currency,
        status: 'draft',
        issuedAt: input.asOf ?? new Date(),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        paidAt: null,
      },
    });

    return {
      invoice: toInvoiceRow(created),
      preview,
      created: true,
    };
  }
}

function toInvoiceRow(r: {
  id: string;
  externalInvoiceId: string;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: Date;
  periodStart: Date;
  periodEnd: Date;
}): IMaterializeMeteredInvoiceResult['invoice'] {
  return {
    id: r.id,
    externalInvoiceId: r.externalInvoiceId,
    amountCents: r.amountCents,
    currency: r.currency,
    status: r.status as 'draft',
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
  };
}
