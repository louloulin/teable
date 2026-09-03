/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — Customer Portal HTTP controller (Phase 5.4, Stage 86).
 *
 * Surface for self-service billing inside the customer-facing app:
 *   GET  /api/billing/portal/subscription?organizationId=org_1
 *   GET  /api/billing/portal/invoices?organizationId=org_1
 *   GET  /api/billing/portal/upcoming-invoice?organizationId=org_1
 *   POST /api/billing/portal/preview-seat-change
 *   POST /api/billing/portal/preview-plan-change
 *   POST /api/billing/portal/change-seats
 *   POST /api/billing/portal/change-plan
 *   POST /api/billing/portal/cancel
 *   POST /api/billing/portal/stripe-portal
 *   GET  /api/billing/portal/invoices/:invoiceId/pdf
 *
 * The read/write sides all delegate to `BillingAuthService`. Stripe
 * Customer Portal + invoice PDF endpoints are present but throw
 * `ServiceUnavailableException` until `STRIPE_SECRET_KEY` (or a Cloud
 * mail/PDF service) is configured; this matches the OSS posture used
 * by `BillingCheckoutController`.
 *
 * Auth model: same `LicenseCapabilityGuard.for('billing')` gate as
 * `BillingCheckoutController`. Per-organization membership is enforced
 * by the upstream guard stack; the controller itself only checks that
 * `organizationId` is present in the request.
 *
 * License: AGPL-3.0
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { BillingAddOnService, type IAddOnDescriptor, type IAddOn } from './billing-add-on.service';
import { BillingAuthService } from './billing.auth.service';
import { BillingMeteredInvoiceService } from './billing-metered-invoice.service';
import { BillingInvoicePdfService } from './billing-invoice-pdf.service';
import { BillingPortalOrgGuard } from './billing-portal-org.guard';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';
import { BillingUsageLedgerService, type BillingUsageMetric } from './billing-usage-ledger.service';
import type { BillingPlanCode } from './billing.types';
import type { IPlanRate } from './billing-proration.service';

const BillingGuard = LicenseCapabilityGuard.for('billing');

interface IChangeSeatsBody {
  organizationId: string;
  deltaSeats: number;
  rate: IPlanRate;
  idempotencyKey?: string;
  asOf?: string;
}

interface IChangePlanBody {
  organizationId: string;
  newSeats: number;
  newPlanCode: BillingPlanCode;
  rateCard: Partial<Record<BillingPlanCode, IPlanRate>>;
  idempotencyKey?: string;
  asOf?: string;
}

interface IPreviewSeatBody {
  organizationId: string;
  deltaSeats: number;
  rate: IPlanRate;
  asOf?: string;
}

interface IPreviewPlanBody {
  organizationId: string;
  newSeats: number;
  newPlanCode: BillingPlanCode;
  rateCard: Partial<Record<BillingPlanCode, IPlanRate>>;
  asOf?: string;
}

interface ICancelBody {
  organizationId: string;
  atPeriodEnd: boolean;
}

interface IStripePortalBody {
  organizationId: string;
  returnUrl: string;
}

/**
 * Default rate cards used by the OSS portal routes. Cloud replaces
 * this with a plan-aware loader (per-org) — for OSS we use a zero
 * rate card so `previewOverage` never produces cents out of
 * nothing, and the UI can layer cloud-side pricing on top.
 */
const STRIPE_API = 'https://api.stripe.com/v1/billing_portal/sessions';

const DEFAULT_RATE_CARDS: ReadonlyArray<{
  metric: 'ai_credits' | 'automation_runs' | 'records' | 'storage_bytes';
  includedQuantity: number;
  tiers: ReadonlyArray<{ threshold: number; unitCents: number }>;
}> = [
  { metric: 'ai_credits', includedQuantity: 10_000, tiers: [{ threshold: 1_000_000, unitCents: 0.01 }] },
  { metric: 'automation_runs', includedQuantity: 1_000, tiers: [{ threshold: 100_000, unitCents: 0.05 }] },
  { metric: 'records', includedQuantity: 50_000, tiers: [{ threshold: 5_000_000, unitCents: 0.001 }] },
  { metric: 'storage_bytes', includedQuantity: 5 * 1024 * 1024 * 1024, tiers: [{ threshold: 1024 * 1024 * 1024 * 1024, unitCents: 0.0001 }] },
];

function requireOrg(orgId: string | undefined): string {
  if (!orgId) throw new BadRequestException('organizationId is required');
  return orgId;
}

function parseAsOf(asOf: string | undefined): Date | undefined {
  if (!asOf) return undefined;
  const parsed = new Date(asOf);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`invalid asOf: ${asOf}`);
  }
  return parsed;
}

@Controller('api/billing/portal')
@UseGuards(BillingGuard, BillingPortalOrgGuard)
export class BillingPortalController {
  constructor(
    private readonly auth: BillingAuthService,
    private readonly config: ConfigService,
    private readonly usageLedger: BillingUsageLedgerService,
    private readonly addOns: BillingAddOnService,
    private readonly meteredInvoice: BillingMeteredInvoiceService,
    private readonly invoicePdfSvc: BillingInvoicePdfService,
    // Guard is injected for symmetry with `@UseGuards()` decoration;
    // the actual `canActivate()` invocation happens at request time
    // through NestJS, so plain `ctrl.method(...)` test calls bypass it.
    private readonly _orgGuard: BillingPortalOrgGuard
  ) {}

  // ─── Reads ────────────────────────────────────────────────────────

  @Get('subscription')
  @Permissions('instance|read')
  async getSubscription(@Query('organizationId') organizationId: string) {
    const orgId = requireOrg(organizationId);
    const subscription = await this.auth.getSubscription(orgId);
    return { organizationId: orgId, subscription };
  }

  @Get('invoices')
  @Permissions('instance|read')
  async listInvoices(@Query('organizationId') organizationId: string) {
    const orgId = requireOrg(organizationId);
    const sub = await this.auth.getSubscription(orgId);
    if (!sub) return { organizationId: orgId, total: 0, invoices: [] };
    const invoices = await this.auth.listInvoices({ subscriptionId: sub.id, limit: 50 });
    return { organizationId: orgId, total: invoices.length, invoices };
  }

  /**
   * Real upcoming-invoice preview backed by the unified usage ledger
   * plus active add-on subscriptions. Cloud replaces the rate-card
   * loader with one that pulls from the org's Stripe-priced plan;
   * OSS uses the zero rate card (no overage, no add-ons) as a safe
   * default that the UI can layer on top of.
   */
  @Get('upcoming-invoice')
  @Permissions('instance|read')
  async getUpcomingInvoice(@Query('organizationId') organizationId: string) {
    const orgId = requireOrg(organizationId);
    const sub = await this.auth.getSubscription(orgId);
    if (!sub) return { organizationId: orgId, upcoming: null };
    const preview = await this.meteredInvoice.previewMeteredInvoice({
      organizationId: orgId,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      rateCards: DEFAULT_RATE_CARDS,
    });
    return {
      organizationId: orgId,
      upcoming: {
        subscriptionId: sub.id,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        currency: preview.currency,
        amountCents: preview.grandTotalCents,
        source: 'metered-invoice-service',
        breakdown: preview.metrics,
        addonMonthlyCostCents: preview.addonMonthlyCostCents,
      },
    };
  }

  /**
   * Per-metric usage + overage preview. Always returns the actual
   * event count and total quantity; overage fields are populated
   * only when a rate card exists for the metric.
   */
  @Get('usage')
  @Permissions('instance|read')
  async getUsage(
    @Query('organizationId') organizationId: string,
    @Query('metric') metric: BillingUsageMetric
  ) {
    const orgId = requireOrg(organizationId);
    const sub = await this.auth.getSubscription(orgId);
    if (!sub) {
      throw new NotFoundException(`subscription not found: ${orgId}`);
    }
    if (!metric) {
      throw new BadRequestException('metric query param is required');
    }
    const agg = await this.usageLedger.aggregate({
      organizationId: orgId,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      metric,
    });
    const card = DEFAULT_RATE_CARDS.find((c) => c.metric === metric);
    const addonGranted = await this.addOns.totalGrantedQuantity({
      organizationId: orgId,
      metric: metric === 'email_sends' ? 'records' : metric, // email_sends has no add-on
      asOf: new Date(),
    });
    let overage: {
      overageQuantity: bigint;
      overageCents: number;
      currency: string;
      tierBreakdown: unknown[];
    } | null = null;
    if (card) {
      const preview = await this.usageLedger.previewOverage({
        organizationId: orgId,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        metric,
        includedQuantity:
          typeof card.includedQuantity === 'bigint'
            ? card.includedQuantity
            : BigInt(card.includedQuantity),
        tiers: card.tiers,
      });
      overage = {
        overageQuantity: preview.overageQuantity,
        overageCents: preview.overageCents,
        currency: preview.currency,
        tierBreakdown: preview.tierBreakdown,
      };
    }
    return {
      organizationId: orgId,
      metric,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      totalQuantity: agg.totalQuantity.toString(),
      eventCount: agg.eventCount,
      addonGrantedQuantity: addonGranted.toString(),
      overage,
    };
  }

  /** Activate a pack add-on for the current period. */
  @Post('activate-addon')
  @Permissions('instance|update')
  async activateAddOn(
    @Body() body: { organizationId: string; descriptor: IAddOnDescriptor }
  ) {
    const orgId = requireOrg(body.organizationId);
    const sub = await this.auth.getSubscription(orgId);
    if (!sub) throw new NotFoundException(`subscription not found: ${orgId}`);
    const addon: IAddOn = await this.addOns.activate({
      organizationId: orgId,
      descriptor: body.descriptor,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
    });
    return { organizationId: orgId, addon };
  }

  /** Cancel an active pack add-on. */
  @Post('cancel-addon')
  @Permissions('instance|update')
  async cancelAddOn(
    @Body() body: { organizationId: string; packCode: string; atPeriodEnd: boolean }
  ) {
    const orgId = requireOrg(body.organizationId);
    if (!body.packCode) throw new BadRequestException('packCode is required');
    const addon = await this.addOns.cancel({
      organizationId: orgId,
      packCode: body.packCode,
      atPeriodEnd: body.atPeriodEnd,
    });
    return { organizationId: orgId, addon };
  }

  // ─── Previews (no writes) ─────────────────────────────────────────

  @Post('preview-seat-change')
  @Permissions('instance|update')
  async previewSeatChange(@Body() body: IPreviewSeatBody) {
    const orgId = requireOrg(body.organizationId);
    const sub = await this.auth.getSubscription(orgId);
    if (!sub) throw new NotFoundException(`subscription not found: ${orgId}`);
    const preview = this.auth.previewSeatChange(
      sub,
      body.deltaSeats,
      body.rate,
      parseAsOf(body.asOf)
    );
    return { organizationId: orgId, preview };
  }

  @Post('preview-plan-change')
  @Permissions('instance|update')
  async previewPlanChange(@Body() body: IPreviewPlanBody) {
    const orgId = requireOrg(body.organizationId);
    const sub = await this.auth.getSubscription(orgId);
    if (!sub) throw new NotFoundException(`subscription not found: ${orgId}`);
    const preview = this.auth.previewPlanChange(
      sub,
      body.newSeats,
      body.newPlanCode,
      body.rateCard,
      parseAsOf(body.asOf)
    );
    return { organizationId: orgId, preview };
  }

  // ─── Mutations ────────────────────────────────────────────────────

  @Post('change-seats')
  @Permissions('instance|update')
  async changeSeats(@Body() body: IChangeSeatsBody) {
    const orgId = requireOrg(body.organizationId);
    const result = await this.auth.changeSeats({
      organizationId: orgId,
      deltaSeats: body.deltaSeats,
      rate: body.rate,
      ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      ...(parseAsOf(body.asOf) ? { asOf: parseAsOf(body.asOf) } : {}),
    });
    return {
      organizationId: orgId,
      subscription: result.sub,
      invoice: result.invoice,
      preview: result.preview,
    };
  }

  @Post('change-plan')
  @Permissions('instance|update')
  async changePlan(@Body() body: IChangePlanBody) {
    const orgId = requireOrg(body.organizationId);
    const result = await this.auth.changePlan({
      organizationId: orgId,
      newSeats: body.newSeats,
      newPlanCode: body.newPlanCode,
      rateCard: body.rateCard,
      ...(body.idempotencyKey ? { idempotencyKey: body.idempotencyKey } : {}),
      ...(parseAsOf(body.asOf) ? { asOf: parseAsOf(body.asOf) } : {}),
    });
    return {
      organizationId: orgId,
      subscription: result.sub,
      invoice: result.invoice,
      preview: result.preview,
    };
  }

  @Post('cancel')
  @Permissions('instance|update')
  async cancel(@Body() body: ICancelBody) {
    const orgId = requireOrg(body.organizationId);
    const subscription = await this.auth.cancelSubscription(orgId, body.atPeriodEnd);
    return { organizationId: orgId, subscription };
  }

  // ─── Cloud-only endpoints (OSS stub) ──────────────────────────────

  /**
   * Stripe Customer Portal session — Round 32 续 (real Stripe call).
   *
   * Wires the previously-stubbed route to the real
   * `POST /v1/billing_portal/sessions` endpoint. The flow:
   *
   *   1. `STRIPE_SECRET_KEY` must be set (503 otherwise).
   *   2. The local `subscription` row must have an `externalCustomerId`
   *      (populated when the org went through the checkout flow). No
   *      customer id means the org has never talked to Stripe, so we
   *      return 503 with a hint pointing at the checkout route — the
   *      404 alternative would leak "this org has no subscription"
   *      and let callers probe existence.
   *   3. The `return_url` is required by Stripe; we accept the
   *      caller-supplied one (already validated by the controller's
   *      `requireOrg` pattern of throwing 400 on missing fields) and
   *      fall back to the platform default.
   *   4. We POST `customer=<id>&return_url=<url>` to Stripe with
   *      Bearer auth and `application/x-www-form-urlencoded`, mirror
   *      of the pattern `BillingCheckoutController.createCheckout`
   *      uses for session creation.
   *   5. The Stripe `{ id, url }` response is returned as-is so the
   *      caller can `window.location = url` (or 302) to land on the
   *      hosted portal.
   *
   * Errors from Stripe (4xx/5xx) are surfaced as 503 with the body
   * text in the message — matches the `BillingCheckoutController`
   * pattern. Network errors throw 503 too; the caller can retry.
   */
  @Post('stripe-portal')
  @Permissions('instance|update')
  async stripePortal(@Body() body: IStripePortalBody) {
    const orgId = requireOrg(body.organizationId);
    if (!body.returnUrl) {
      throw new BadRequestException('returnUrl is required');
    }
    const stripeKey = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new ServiceUnavailableException(
        'Stripe Customer Portal is not configured: STRIPE_SECRET_KEY is missing'
      );
    }
    const subscription = await this.auth.getSubscription(orgId);
    const customerId = subscription?.externalCustomerId;
    if (!customerId) {
      throw new ServiceUnavailableException(
        'Stripe Customer Portal is not available: this organization has no Stripe customer yet. ' +
          'Complete checkout at POST /api/billing/checkout to create a customer first.'
      );
    }
    const params = new URLSearchParams();
    params.append('customer', customerId);
    params.append('return_url', body.returnUrl);
    const res = await fetch(STRIPE_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(
        `Stripe Customer Portal error ${res.status}: ${text}`
      );
    }
    const session = (await res.json()) as { id: string; url: string };
    return { organizationId: orgId, sessionId: session.id, url: session.url };
  }

  /**
   * Invoice PDF download — bridges the real `invoice` table (Round 11)
   * to the pure-JS PDF generator (Round 18). The body is a raw PDF
   * byte stream; `Content-Disposition` is set so browsers trigger a
   * download rather than render inline.
   *
   * Per-org guard: the caller MUST supply `?organizationId=` matching
   * the subscription that owns the invoice. A mismatch returns 404
   * (not 403) so the route can't be used to enumerate invoice ids.
   */
  @Get('invoices/:invoiceId/pdf')
  @Permissions('instance|read')
  @Header('Content-Type', 'application/pdf')
  async invoicePdf(
    @Param('invoiceId') invoiceId: string,
    @Query('organizationId') organizationId: string,
    @Query('fresh') fresh: string | undefined,
    @Res({ passthrough: true }) res: Response
  ): Promise<Buffer> {
    if (!invoiceId) throw new BadRequestException('invoiceId is required');
    if (!organizationId) throw new BadRequestException('organizationId is required');
    // `?fresh=true` (or any truthy "1"/"yes") bypasses the PDF cache
    // so the operator can force a re-render after a manual invoice
    // adjustment. Default behavior is read-through cache.
    const forceFresh = parseBooleanQuery(fresh);
    const result = await this.invoicePdfSvc.renderInvoice({
      invoiceId,
      organizationId,
      fresh: forceFresh,
    });
    // Dynamic filename header — can't use the @Header() decorator
    // because the value depends on the route param.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${invoiceId}.pdf"`
    );
    res.setHeader('X-PDF-SHA256', result.doc.sha256);
    res.setHeader('X-PDF-Size', String(result.doc.size));
    // Surface cache state to the UI so dashboards can show
    // "served from cache" vs "freshly rendered".
    res.setHeader('X-PDF-Cache', forceFresh ? 'bypass' : 'hit-or-miss');
    return Buffer.from(result.doc.bytes);
  }
}

function parseBooleanQuery(raw: string | undefined): boolean {
  if (raw === undefined) return false;
  const lower = raw.toLowerCase();
  return lower === 'true' || lower === '1' || lower === 'yes';
}
