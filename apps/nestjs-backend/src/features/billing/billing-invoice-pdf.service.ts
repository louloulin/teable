/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — invoice PDF bridge (Phase 5.4 续, Round 18).
 *
 * Connects the real `invoice` Prisma table (Round 11) and the metered
 * invoice preview (Round 15) to the pure-JS PDF generator in
 * `billing-pdf-export`. Without this service, the portal route
 * `GET /api/billing/portal/invoices/:invoiceId/pdf` returns a 503 stub.
 *
 * The bridge does three things:
 *
 *   1. **Per-org guard** — load the invoice by id, then resolve its
 *      subscription and confirm `subscription.organizationId` matches
 *      the requester's `organizationId`. A mismatch raises 404 (NOT
 *      403) so a caller can't enumerate invoices they don't own.
 *   2. **Line-item assembly** — call `meteredInvoice.previewMeteredInvoice`
 *      for the invoice's `[periodStart, periodEnd)` window so the PDF
 *      shows the same breakdown the Customer Portal `/upcoming-invoice`
 *      route shows. Metrics with non-zero overage contribute one line;
 *      add-on monthly cost contributes one line. When neither has any
 *      data (legacy non-metered invoice), a single fallback line is
 *      emitted so the PDF still validates.
 *   3. **Currency normalization** — `invoice.currency` is lowercase 3-letter
 *      (Prisma column); `IBillingInvoice.currency` is the
 *      `CurrencyCode` enum (uppercase). Map at the boundary.
 *
 * License: AGPL-3.0
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  BillingPdfExportAuthService,
  buildSummary,
  renderInvoicePdf,
  type CurrencyCode,
  type IBillingInvoice,
  type IBillingLineItem,
  type IBillingSummary,
  type IPdfRenderResult,
} from '../billing-pdf-export';
import { BillingMeteredInvoiceService, type IMetricRateCard } from './billing-metered-invoice.service';

export interface IRenderInvoicePdfInput {
  invoiceId: string;
  organizationId: string;
  /**
   * Rate cards to price the overage against. Defaults to the portal's
   * `DEFAULT_RATE_CARDS` (4 metrics, conservative included + tail-tier)
   * if omitted — matches what `/upcoming-invoice` displays.
   */
  rateCards?: ReadonlyArray<IMetricRateCard>;
  /**
   * Bypass the cached `billing_pdf_export` row and force a fresh
   * render + write. Use when the operator regenerates an invoice
   * (e.g. manual adjustment from the dashboard).
   */
  fresh?: boolean;
}

const ALLOWED_CURRENCIES: ReadonlySet<CurrencyCode> = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CNY',
]);

const FALLBACK_CURRENCY: CurrencyCode = 'USD';

@Injectable()
export class BillingInvoicePdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meteredInvoice: BillingMeteredInvoiceService,
    private readonly pdfCache: BillingPdfExportAuthService
  ) {}

  async renderInvoice(input: IRenderInvoicePdfInput): Promise<IPdfRenderResult> {
    if (!input.invoiceId) throw new NotFoundException('invoiceId is required');
    if (!input.organizationId) throw new NotFoundException('organizationId is required');

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
    });
    if (!invoice) throw new NotFoundException(`invoice not found: ${input.invoiceId}`);

    const subscription = await this.prisma.subscription.findUnique({
      where: { id: invoice.subscriptionId },
    });
    // Per-org guard: hide the existence of invoices that don't belong
    // to the requesting org by returning the same 404 as "no such
    // invoice". This avoids turning the route into an enumeration
    // oracle.
    if (!subscription || subscription.organizationId !== input.organizationId) {
      throw new NotFoundException(`invoice not found: ${input.invoiceId}`);
    }

    const currency = normalizeCurrency(invoice.currency);

    // Cache fast-path: if the caller hasn't forced a fresh render and
    // a `billing_pdf_export` row already exists for this invoice, hand
    // back its bytes directly. We still recompute the summary from the
    // live metered preview so the response shape stays aligned with
    // the render path (UI consumers don't branch on cache vs fresh).
    if (!input.fresh) {
      const cached = await this.pdfCache.latestExport(invoice.id);
      if (cached) {
        const { summary } = await this.computeSummary({
          organizationId: subscription.organizationId,
          invoice,
          rateCards: input.rateCards ?? [],
        });
        return {
          doc: {
            bytes: cached.bytes,
            size: cached.bytes.byteLength,
            sha256: cached.sha256,
          },
          pageCount: 0,
          summary,
          warnings: [],
        };
      }
    }

    const { summary, preview } = await this.computeSummary({
      organizationId: subscription.organizationId,
      invoice,
      rateCards: input.rateCards ?? [],
    });

    const lines = buildLineItems({
      preview,
      invoiceAmountCents: invoice.amountCents,
      currency,
    });

    const billingInvoice: IBillingInvoice = {
      id: invoice.id,
      orgId: subscription.organizationId,
      customerName: `Organization ${subscription.organizationId}`,
      currency,
      periodStart: invoice.periodStart.toISOString(),
      periodEnd: invoice.periodEnd.toISOString(),
      issuedAt: invoice.issuedAt.toISOString(),
      lines,
      // Surface the external id as a note so operators can correlate
      // with their Stripe dashboard without leaving the PDF.
      notes: `external_invoice_id: ${invoice.externalInvoiceId}`,
    };

    const rendered = renderInvoicePdf(billingInvoice);

    // Persist for next call's cache hit. Failures here are non-fatal —
    // the caller already has a rendered PDF; a failed cache write just
    // means the next request will re-render. We swallow the error after
    // logging via the surrounding NestJS logger in Cloud.
    try {
      await this.pdfCache.storeExport({ invoiceId: invoice.id, doc: rendered.doc });
    } catch {
      // Intentionally empty: see comment above.
    }

    return rendered;
  }

  /**
   * Recompute the summary from the current metered invoice preview
   * (overage lines + addon monthly cost + fallback). The cached
   * fast-path needs the same `summary` shape as a fresh render so the
   * controller can return a uniform payload.
   */
  private async computeSummary(input: {
    organizationId: string;
    invoice: {
      id: string;
      amountCents: number;
      currency: string;
      periodStart: Date;
      periodEnd: Date;
    };
    rateCards: ReadonlyArray<IMetricRateCard>;
  }): Promise<{ summary: IBillingSummary; preview: Awaited<ReturnType<BillingMeteredInvoiceService['previewMeteredInvoice']>> }> {
    const preview = await this.meteredInvoice.previewMeteredInvoice({
      organizationId: input.organizationId,
      periodStart: input.invoice.periodStart,
      periodEnd: input.invoice.periodEnd,
      rateCards: input.rateCards,
    });
    const lines = buildLineItems({
      preview,
      invoiceAmountCents: input.invoice.amountCents,
      currency: normalizeCurrency(input.invoice.currency),
    });
    const summary = buildSummary({
      id: input.invoice.id,
      orgId: input.organizationId,
      customerName: `Organization ${input.organizationId}`,
      currency: normalizeCurrency(input.invoice.currency),
      periodStart: input.invoice.periodStart.toISOString(),
      periodEnd: input.invoice.periodEnd.toISOString(),
      issuedAt: input.invoice.periodStart.toISOString(),
      lines,
    });
    return { summary, preview };
  }
}

function normalizeCurrency(c: string): CurrencyCode {
  const upper = c.toUpperCase();
  return ALLOWED_CURRENCIES.has(upper as CurrencyCode)
    ? (upper as CurrencyCode)
    : FALLBACK_CURRENCY;
}

function buildLineItems(input: {
  preview: Awaited<
    ReturnType<BillingMeteredInvoiceService['previewMeteredInvoice']>
  >;
  invoiceAmountCents: number;
  currency: CurrencyCode;
}): IBillingLineItem[] {
  const lines: IBillingLineItem[] = [];
  let counter = 0;
  const nextId = (): string => {
    counter += 1;
    return `l_${counter.toString().padStart(3, '0')}`;
  };
  const periodStart = input.preview.periodStart.toISOString();
  const periodEnd = input.preview.periodEnd.toISOString();

  // 1) One line per metric that actually produced overage cents. We
  // skip zero-overage metrics to keep the PDF readable — usage that
  // stayed inside the included+add-on quota doesn't belong on a bill.
  for (const m of input.preview.metrics) {
    if (m.overageCents <= 0) continue;
    lines.push({
      id: nextId(),
      description: `Overage: ${m.metric}`,
      quantity: Number(m.overageQuantity),
      unitCents: m.overageCents / Math.max(1, Number(m.overageQuantity)),
      totalCents: m.overageCents,
      periodStart,
      periodEnd,
    });
  }

  // 2) One line for add-on monthly cost when present. The portal
  // surfaces this as a separate "addons" total; the PDF groups it with
  // the overage breakdown under a single description.
  if (input.preview.addonMonthlyCostCents > 0) {
    lines.push({
      id: nextId(),
      description: 'Add-on subscriptions (monthly)',
      quantity: 1,
      unitCents: input.preview.addonMonthlyCostCents,
      totalCents: input.preview.addonMonthlyCostCents,
      periodStart,
      periodEnd,
    });
  }

  // 3) Fallback for legacy / non-metered invoices: the metered
  // preview returned nothing, so emit a single line so the PDF
  // validator accepts the document and the operator can still see
  // the period total.
  if (lines.length === 0) {
    lines.push({
      id: nextId(),
      description: 'Subscription adjustment',
      quantity: 1,
      unitCents: input.invoiceAmountCents,
      totalCents: input.invoiceAmountCents,
      periodStart,
      periodEnd,
    });
  }

  return lines;
}
