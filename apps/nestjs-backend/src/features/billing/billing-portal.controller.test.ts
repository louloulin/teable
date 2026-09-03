/* eslint-disable @typescript-eslint/naming-convention */
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, vi } from 'vitest';

import { BillingPortalController } from './billing-portal.controller';

interface IMockAuth {
  getSubscription: ReturnType<typeof vi.fn>;
  listInvoices: ReturnType<typeof vi.fn>;
  previewSeatChange: ReturnType<typeof vi.fn>;
  previewPlanChange: ReturnType<typeof vi.fn>;
  changeSeats: ReturnType<typeof vi.fn>;
  changePlan: ReturnType<typeof vi.fn>;
  cancelSubscription: ReturnType<typeof vi.fn>;
}
interface IMockLedger {
  aggregate: ReturnType<typeof vi.fn>;
  previewOverage: ReturnType<typeof vi.fn>;
}
interface IMockAddOns {
  totalGrantedQuantity: ReturnType<typeof vi.fn>;
  activate: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}
interface IMockMetered {
  previewMeteredInvoice: ReturnType<typeof vi.fn>;
}

interface IMockInvoicePdf {
  renderInvoice: ReturnType<typeof vi.fn>;
}
const buildInvoicePdf = (): IMockInvoicePdf => ({
  renderInvoice: vi.fn(async () => ({
    doc: {
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
      size: 8,
      sha256: '0'.repeat(64),
    },
    pageCount: 1,
    summary: { invoiceId: 'inv_x', currency: 'USD', subtotalCents: 0, taxCents: 0, totalCents: 0, lineCount: 0 },
    warnings: [],
  })),
});

const buildAuth = (): IMockAuth => ({
  getSubscription: vi.fn(async () => null),
  listInvoices: vi.fn(async () => []),
  previewSeatChange: vi.fn(() => ({
    prorationCents: 1000,
    currency: 'USD',
    noOp: false,
  })),
  previewPlanChange: vi.fn(() => ({
    prorationCents: -500,
    currency: 'USD',
    noOp: false,
  })),
  changeSeats: vi.fn(async () => ({
    sub: { id: 'sub_a', organizationId: 'o_a', status: 'active' },
    invoice: null,
    preview: { prorationCents: 1000, currency: 'USD', noOp: false },
  })),
  changePlan: vi.fn(async () => ({
    sub: { id: 'sub_a', organizationId: 'o_a', status: 'active' },
    invoice: { id: 'inv_new', amountCents: 1500 },
    preview: { prorationCents: 1500, currency: 'USD', noOp: false },
  })),
  cancelSubscription: vi.fn(async (organizationId: string, atPeriodEnd: boolean) => ({
    id: 'sub_a',
    organizationId,
    status: atPeriodEnd ? 'active' : 'canceled',
    cancelAtPeriodEnd: atPeriodEnd,
  })),
});
const buildLedger = (): IMockLedger => ({
  aggregate: vi.fn(async () => ({ totalQuantity: 0n, eventCount: 0 })),
  previewOverage: vi.fn(async () => ({
    overageQuantity: 0n,
    overageCents: 0,
    currency: 'usd',
    tierBreakdown: [],
  })),
});
const buildAddOns = (): IMockAddOns => ({
  totalGrantedQuantity: vi.fn(async () => 0n),
  activate: vi.fn(async () => ({
    id: 'addon_1', organizationId: 'o_a', metric: 'ai_credits', packCode: 'p1',
    grantedQuantity: 1000n, monthlyPriceCents: 1900, currency: 'usd', status: 'active',
    currentPeriodStart: new Date(), currentPeriodEnd: new Date(), canceledAt: null,
    createdTime: new Date(), updatedTime: new Date(),
  })),
  cancel: vi.fn(async () => null),
});
const buildMetered = (): IMockMetered => ({
  previewMeteredInvoice: vi.fn(async () => ({
    organizationId: 'o_a',
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-10-01T00:00:00Z'),
    currency: 'usd',
    metrics: [],
    totalCents: 0,
    addonMonthlyCostCents: 0,
    grandTotalCents: 0,
  })),
});

describe('BillingPortalController (Phase 5.4 + 5.5 part 3)', () => {
  let auth: IMockAuth;
  let config: ConfigService;
  let ledger: IMockLedger;
  let addOns: IMockAddOns;
  let metered: IMockMetered;
  let pdf: IMockInvoicePdf;
  let ctrl: BillingPortalController;

  beforeEach(() => {
    auth = buildAuth();
    config = { get: vi.fn(() => undefined) } as unknown as ConfigService;
    ledger = buildLedger();
    addOns = buildAddOns();
    metered = buildMetered();
    pdf = buildInvoicePdf();
    ctrl = new BillingPortalController(
      auth as never,
      config,
      ledger as never,
      addOns as never,
      metered as never,
      pdf as never,
      {} as never
    );
  });

  describe('getSubscription', () => {
    it('returns the subscription for an organization', async () => {
      auth.getSubscription.mockResolvedValueOnce({
        id: 'sub_x',
        organizationId: 'o_x',
        planCode: 'pro',
        status: 'active',
      });
      const out = await ctrl.getSubscription('o_x');
      expect(out).toMatchObject({ organizationId: 'o_x', subscription: { planCode: 'pro' } });
    });

    it('returns null subscription when the org has none', async () => {
      const out = await ctrl.getSubscription('o_none');
      expect(out.subscription).toBeNull();
    });

    it('rejects missing organizationId', async () => {
      await expect(ctrl.getSubscription('')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listInvoices', () => {
    it('returns empty list when no subscription exists', async () => {
      const out = await ctrl.listInvoices('o_none');
      expect(out.total).toBe(0);
      expect(out.invoices).toEqual([]);
    });

    it('forwards subscriptionId to listInvoices', async () => {
      auth.getSubscription.mockResolvedValueOnce({ id: 'sub_a', organizationId: 'o_a' });
      auth.listInvoices.mockResolvedValueOnce([{ id: 'inv_1' }, { id: 'inv_2' }]);
      const out = await ctrl.listInvoices('o_a');
      expect(out.total).toBe(2);
      expect(auth.listInvoices).toHaveBeenCalledWith({ subscriptionId: 'sub_a', limit: 50 });
    });
  });

  // getUpcomingInvoice is covered by the 'getUpcomingInvoice (Phase 5.5
  // part 3 — real)' describe block at the bottom of this file. The
  // earlier stub-based assertion was removed when the route moved from
  // an OSS stub to a real ledger-backed preview.

  describe('previewSeatChange / previewPlanChange', () => {
    it('requires an existing subscription', async () => {
      await expect(
        ctrl.previewSeatChange({ organizationId: 'o_x', deltaSeats: 1, rate: { monthlyPriceCentsPerSeat: 1000, currency: 'USD' } })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the seat-change preview math', async () => {
      auth.getSubscription.mockResolvedValueOnce({
        id: 'sub_a',
        organizationId: 'o_a',
        planCode: 'pro',
        seats: 3,
        currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      });
      const out = await ctrl.previewSeatChange({
        organizationId: 'o_a',
        deltaSeats: 2,
        rate: { monthlyPriceCentsPerSeat: 1000, currency: 'USD' },
        asOf: '2026-09-15T00:00:00Z',
      });
      expect(auth.previewSeatChange).toHaveBeenCalledTimes(1);
      expect(out.preview).toMatchObject({ prorationCents: 1000, noOp: false });
    });

    it('returns the plan-change preview math', async () => {
      auth.getSubscription.mockResolvedValueOnce({
        id: 'sub_a',
        organizationId: 'o_a',
        planCode: 'pro',
        seats: 3,
        currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      });
      const out = await ctrl.previewPlanChange({
        organizationId: 'o_a',
        newSeats: 5,
        newPlanCode: 'team',
        rateCard: {
          pro: { monthlyPriceCentsPerSeat: 1200, currency: 'USD' },
          team: { monthlyPriceCentsPerSeat: 2900, currency: 'USD' },
        },
      });
      expect(auth.previewPlanChange).toHaveBeenCalledTimes(1);
      expect(out.preview).toMatchObject({ prorationCents: -500 });
    });

    it('rejects malformed asOf', async () => {
      auth.getSubscription.mockResolvedValueOnce({
        id: 'sub_a', organizationId: 'o_a', planCode: 'pro', seats: 3,
        currentPeriodStart: new Date(), currentPeriodEnd: new Date(),
      });
      await expect(
        ctrl.previewSeatChange({
          organizationId: 'o_a',
          deltaSeats: 1,
          rate: { monthlyPriceCentsPerSeat: 1000, currency: 'USD' },
          asOf: 'not-a-date',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('changeSeats / changePlan / cancel', () => {
    it('changeSeats forwards to BillingAuthService.changeSeats', async () => {
      const out = await ctrl.changeSeats({
        organizationId: 'o_a',
        deltaSeats: 2,
        rate: { monthlyPriceCentsPerSeat: 1000, currency: 'USD' },
        idempotencyKey: 'req-1',
      });
      expect(auth.changeSeats).toHaveBeenCalledWith({
        organizationId: 'o_a',
        deltaSeats: 2,
        rate: { monthlyPriceCentsPerSeat: 1000, currency: 'USD' },
        idempotencyKey: 'req-1',
      });
      expect(out).toMatchObject({ organizationId: 'o_a' });
    });

    it('changePlan forwards to BillingAuthService.changePlan', async () => {
      const out = await ctrl.changePlan({
        organizationId: 'o_a',
        newSeats: 5,
        newPlanCode: 'team',
        rateCard: {
          pro: { monthlyPriceCentsPerSeat: 1200, currency: 'USD' },
          team: { monthlyPriceCentsPerSeat: 2900, currency: 'USD' },
        },
      });
      expect(auth.changePlan).toHaveBeenCalledTimes(1);
      expect(out.invoice).toMatchObject({ id: 'inv_new' });
    });

    it('cancel routes to BillingAuthService.cancelSubscription with atPeriodEnd', async () => {
      const out = await ctrl.cancel({ organizationId: 'o_a', atPeriodEnd: true });
      expect(auth.cancelSubscription).toHaveBeenCalledWith('o_a', true);
      expect(out.subscription.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('stripePortal (Round 32 — real Stripe API)', () => {
    let originalFetch: typeof fetch;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      originalFetch = global.fetch;
      fetchMock = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      global.fetch = fetchMock as any;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns 503 when STRIPE_SECRET_KEY is missing', async () => {
      await expect(
        ctrl.stripePortal({ organizationId: 'o_a', returnUrl: 'https://app.example.com/billing' })
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects 400 when returnUrl is missing', async () => {
      config = { get: vi.fn((key: string) => (key === 'STRIPE_SECRET_KEY' ? 'sk_test_1' : undefined)) } as unknown as ConfigService;
      ctrl = new BillingPortalController(
        auth as never, config, ledger as never, addOns as never,
        metered as never, pdf as never, {} as never
      );
      await expect(
        // @ts-expect-error — returnUrl intentionally missing
        ctrl.stripePortal({ organizationId: 'o_a' })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns 503 with hint when subscription has no externalCustomerId', async () => {
      config = { get: vi.fn((key: string) => (key === 'STRIPE_SECRET_KEY' ? 'sk_test_1' : undefined)) } as unknown as ConfigService;
      ctrl = new BillingPortalController(
        auth as never, config, ledger as never, addOns as never,
        metered as never, pdf as never, {} as never
      );
      auth.getSubscription.mockResolvedValueOnce({ id: 'sub_a', organizationId: 'o_a', externalCustomerId: '' });
      await expect(
        ctrl.stripePortal({ organizationId: 'o_a', returnUrl: 'https://app.example.com/billing' })
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('returns 503 when there is no subscription at all', async () => {
      config = { get: vi.fn((key: string) => (key === 'STRIPE_SECRET_KEY' ? 'sk_test_1' : undefined)) } as unknown as ConfigService;
      ctrl = new BillingPortalController(
        auth as never, config, ledger as never, addOns as never,
        metered as never, pdf as never, {} as never
      );
      auth.getSubscription.mockResolvedValueOnce(null);
      await expect(
        ctrl.stripePortal({ organizationId: 'o_a', returnUrl: 'https://app.example.com/billing' })
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('POSTs to Stripe billing_portal/sessions with customer + return_url and returns the session URL', async () => {
      config = { get: vi.fn((key: string) => (key === 'STRIPE_SECRET_KEY' ? 'sk_test_1' : undefined)) } as unknown as ConfigService;
      ctrl = new BillingPortalController(
        auth as never, config, ledger as never, addOns as never,
        metered as never, pdf as never, {} as never
      );
      auth.getSubscription.mockResolvedValueOnce({ id: 'sub_a', organizationId: 'o_a', externalCustomerId: 'cus_test_1' });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'bps_1', url: 'https://billing.stripe.com/p/session/test' }),
      });
      const out = await ctrl.stripePortal({
        organizationId: 'o_a',
        returnUrl: 'https://app.example.com/billing',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
      expect(calledUrl).toBe('https://api.stripe.com/v1/billing_portal/sessions');
      expect(calledInit.method).toBe('POST');
      expect(calledInit.headers.Authorization).toBe('Bearer sk_test_1');
      expect(calledInit.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
      const body = String(calledInit.body);
      expect(body).toContain('customer=cus_test_1');
      expect(body).toContain('return_url=https%3A%2F%2Fapp.example.com%2Fbilling');
      expect(out).toEqual({
        organizationId: 'o_a',
        sessionId: 'bps_1',
        url: 'https://billing.stripe.com/p/session/test',
      });
    });

    it('propagates Stripe 4xx as 503 with the response body in the message', async () => {
      config = { get: vi.fn((key: string) => (key === 'STRIPE_SECRET_KEY' ? 'sk_test_1' : undefined)) } as unknown as ConfigService;
      ctrl = new BillingPortalController(
        auth as never, config, ledger as never, addOns as never,
        metered as never, pdf as never, {} as never
      );
      auth.getSubscription.mockResolvedValueOnce({ id: 'sub_a', organizationId: 'o_a', externalCustomerId: 'cus_test_1' });
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'No such customer: cus_test_1',
      });
      await expect(
        ctrl.stripePortal({ organizationId: 'o_a', returnUrl: 'https://app.example.com/billing' })
      ).rejects.toMatchObject({
        message: expect.stringContaining('400'),
      });
    });

    it('propagates Stripe 5xx as 503', async () => {
      config = { get: vi.fn((key: string) => (key === 'STRIPE_SECRET_KEY' ? 'sk_test_1' : undefined)) } as unknown as ConfigService;
      ctrl = new BillingPortalController(
        auth as never, config, ledger as never, addOns as never,
        metered as never, pdf as never, {} as never
      );
      auth.getSubscription.mockResolvedValueOnce({ id: 'sub_a', organizationId: 'o_a', externalCustomerId: 'cus_test_1' });
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });
      await expect(
        ctrl.stripePortal({ organizationId: 'o_a', returnUrl: 'https://app.example.com/billing' })
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('invoicePdf (Phase 5.4 续 — real PDF)', () => {
    it('returns a PDF buffer for a valid invoiceId + organizationId', async () => {
      const fakeRes = { setHeader: vi.fn() } as unknown as Parameters<BillingPortalController['invoicePdf']>[3];
      const out = await ctrl.invoicePdf('inv_1', 'o_a', undefined, fakeRes);
      expect(Buffer.isBuffer(out)).toBe(true);
      expect(out.length).toBeGreaterThan(0);
      expect(pdf.renderInvoice).toHaveBeenCalledWith({
        invoiceId: 'inv_1',
        organizationId: 'o_a',
        fresh: false,
      });
      expect(fakeRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="inv_1.pdf"'
      );
      expect(fakeRes.setHeader).toHaveBeenCalledWith(
        'X-PDF-SHA256',
        expect.stringMatching(/^[0-9a-f]{64}$/)
      );
      expect(fakeRes.setHeader).toHaveBeenCalledWith('X-PDF-Size', expect.any(String));
    });

    it('rejects missing invoiceId (400)', async () => {
      const fakeRes = { setHeader: vi.fn() } as unknown as Parameters<BillingPortalController['invoicePdf']>[3];
      await expect(ctrl.invoicePdf('', 'o_a', undefined, fakeRes)).rejects.toBeInstanceOf(BadRequestException);
      expect(pdf.renderInvoice).not.toHaveBeenCalled();
    });

    it('rejects missing organizationId (400)', async () => {
      const fakeRes = { setHeader: vi.fn() } as unknown as Parameters<BillingPortalController['invoicePdf']>[3];
      await expect(ctrl.invoicePdf('inv_1', '', undefined, fakeRes)).rejects.toBeInstanceOf(BadRequestException);
      expect(pdf.renderInvoice).not.toHaveBeenCalled();
    });

    it('propagates NotFound from the PDF service (per-org guard)', async () => {
      pdf.renderInvoice.mockRejectedValueOnce(new NotFoundException('invoice not found'));
      const fakeRes = { setHeader: vi.fn() } as unknown as Parameters<BillingPortalController['invoicePdf']>[3];
      await expect(ctrl.invoicePdf('inv_x', 'o_other', undefined, fakeRes)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forwards ?fresh=true to the PDF service (cache bypass)', async () => {
      const fakeRes = { setHeader: vi.fn() } as unknown as Parameters<BillingPortalController['invoicePdf']>[3];
      await ctrl.invoicePdf('inv_1', 'o_a', 'true', fakeRes);
      expect(pdf.renderInvoice).toHaveBeenLastCalledWith({
        invoiceId: 'inv_1',
        organizationId: 'o_a',
        fresh: true,
      });
      expect(fakeRes.setHeader).toHaveBeenCalledWith('X-PDF-Cache', 'bypass');
    });

    it('forwards ?fresh=1 as truthy cache bypass', async () => {
      const fakeRes = { setHeader: vi.fn() } as unknown as Parameters<BillingPortalController['invoicePdf']>[3];
      await ctrl.invoicePdf('inv_1', 'o_a', '1', fakeRes);
      expect(pdf.renderInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({ fresh: true })
      );
    });

    it('treats absent ?fresh as cache read-through (default)', async () => {
      const fakeRes = { setHeader: vi.fn() } as unknown as Parameters<BillingPortalController['invoicePdf']>[3];
      await ctrl.invoicePdf('inv_1', 'o_a', undefined, fakeRes);
      expect(pdf.renderInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({ fresh: false })
      );
      expect(fakeRes.setHeader).toHaveBeenCalledWith('X-PDF-Cache', 'hit-or-miss');
    });

    it('rejects non-truthy ?fresh values as cache read-through', async () => {
      const fakeRes = { setHeader: vi.fn() } as unknown as Parameters<BillingPortalController['invoicePdf']>[3];
      await ctrl.invoicePdf('inv_1', 'o_a', 'no', fakeRes);
      expect(pdf.renderInvoice).toHaveBeenLastCalledWith(
        expect.objectContaining({ fresh: false })
      );
    });
  });

  describe('getUpcomingInvoice (Phase 5.5 part 3 — real)', () => {
    it('calls meteredInvoice.previewMeteredInvoice when a subscription exists', async () => {
      auth.getSubscription.mockResolvedValueOnce({
        id: 'sub_a',
        organizationId: 'o_a',
        planCode: 'pro',
        seats: 3,
        currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      });
      metered.previewMeteredInvoice.mockResolvedValueOnce({
        organizationId: 'o_a',
        periodStart: new Date('2026-09-01T00:00:00Z'),
        periodEnd: new Date('2026-10-01T00:00:00Z'),
        currency: 'usd',
        metrics: [],
        totalCents: 0,
        addonMonthlyCostCents: 1900,
        grandTotalCents: 1900,
      });
      const out = await ctrl.getUpcomingInvoice('o_a');
      expect(out.upcoming).toMatchObject({
        source: 'metered-invoice-service',
        amountCents: 1900,
        addonMonthlyCostCents: 1900,
      });
      expect(metered.previewMeteredInvoice).toHaveBeenCalledTimes(1);
    });

    it('returns null upcoming when no subscription exists', async () => {
      const out = await ctrl.getUpcomingInvoice('o_none');
      expect(out.upcoming).toBeNull();
      expect(metered.previewMeteredInvoice).not.toHaveBeenCalled();
    });
  });

  describe('getUsage', () => {
    it('returns aggregate + overage for a known metric', async () => {
      auth.getSubscription.mockResolvedValueOnce({
        id: 'sub_a',
        organizationId: 'o_a',
        currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      });
      ledger.aggregate.mockResolvedValueOnce({ totalQuantity: 12_345n, eventCount: 42 });
      ledger.previewOverage.mockResolvedValueOnce({
        overageQuantity: 2_345n,
        overageCents: 2345,
        currency: 'usd',
        tierBreakdown: [],
      });
      addOns.totalGrantedQuantity.mockResolvedValueOnce(5_000n);

      const out = await ctrl.getUsage('o_a', 'ai_credits');
      expect(out.metric).toBe('ai_credits');
      expect(out.totalQuantity).toBe('12345');
      expect(out.eventCount).toBe(42);
      expect(out.addonGrantedQuantity).toBe('5000');
      expect(out.overage).toMatchObject({ overageCents: 2345 });
    });

    it('returns overage: null for metrics without a rate card (e.g. email_sends)', async () => {
      auth.getSubscription.mockResolvedValueOnce({
        id: 'sub_a',
        organizationId: 'o_a',
        currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      });
      const out = await ctrl.getUsage('o_a', 'email_sends');
      expect(out.overage).toBeNull();
      expect(ledger.previewOverage).not.toHaveBeenCalled();
    });

    it('requires the metric query parameter', async () => {
      auth.getSubscription.mockResolvedValueOnce({
        id: 'sub_a',
        organizationId: 'o_a',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      });
      await expect(ctrl.getUsage('o_a', '' as never)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 404 when no subscription exists', async () => {
      await expect(ctrl.getUsage('o_none', 'ai_credits')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('activateAddOn / cancelAddOn', () => {
    it('activateAddOn forwards to BillingAddOnService.activate', async () => {
      auth.getSubscription.mockResolvedValueOnce({
        id: 'sub_a',
        organizationId: 'o_a',
        currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
      });
      const out = await ctrl.activateAddOn({
        organizationId: 'o_a',
        descriptor: { packCode: 'ai-credits-100k', metric: 'ai_credits', grantedQuantity: 100_000, monthlyPriceCents: 1900 },
      });
      expect(addOns.activate).toHaveBeenCalledTimes(1);
      expect(out.addon.status).toBe('active');
    });

    it('cancelAddOn requires packCode', async () => {
      await expect(
        ctrl.cancelAddOn({ organizationId: 'o_a', packCode: '', atPeriodEnd: true })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cancelAddOn forwards to BillingAddOnService.cancel', async () => {
      const out = await ctrl.cancelAddOn({
        organizationId: 'o_a',
        packCode: 'ai-credits-100k',
        atPeriodEnd: true,
      });
      expect(addOns.cancel).toHaveBeenCalledWith({
        organizationId: 'o_a',
        packCode: 'ai-credits-100k',
        atPeriodEnd: true,
      });
      expect(out.addon).toBeNull();
    });
  });
});
