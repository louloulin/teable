/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingInvoicePdfService } from './billing-invoice-pdf.service';
import type { IMetricRateCard } from './billing-metered-invoice.service';

interface IMockPrisma {
  invoice: { findUnique: ReturnType<typeof vi.fn> };
  subscription: { findUnique: ReturnType<typeof vi.fn> };
}

interface IMockMeteredInvoice {
  previewMeteredInvoice: ReturnType<typeof vi.fn>;
}

interface IMockPdfCache {
  latestExport: ReturnType<typeof vi.fn>;
  storeExport: ReturnType<typeof vi.fn>;
}

const RATE_CARDS: ReadonlyArray<IMetricRateCard> = [
  { metric: 'ai_credits', includedQuantity: 10_000, tiers: [] },
];

const buildInvoice = (overrides: Partial<{
  id: string;
  subscriptionId: string;
  amountCents: number;
  currency: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  issuedAt: Date;
  externalInvoiceId: string;
}> = {}) => ({
  id: overrides.id ?? 'inv_1',
  subscriptionId: overrides.subscriptionId ?? 'sub_1',
  externalInvoiceId: overrides.externalInvoiceId ?? 'metered:org_1:2026-01-01',
  amountCents: overrides.amountCents ?? 12_345,
  currency: overrides.currency ?? 'usd',
  status: overrides.status ?? 'draft',
  issuedAt: overrides.issuedAt ?? new Date('2026-02-01T00:00:00.000Z'),
  periodStart: overrides.periodStart ?? new Date('2026-01-01T00:00:00.000Z'),
  periodEnd: overrides.periodEnd ?? new Date('2026-01-31T23:59:59.000Z'),
  paidAt: null,
});

const buildSubscription = (overrides: Partial<{ id: string; organizationId: string }> = {}) => ({
  id: overrides.id ?? 'sub_1',
  organizationId: overrides.organizationId ?? 'org_1',
  planCode: 'team',
  status: 'active',
  externalSubscriptionId: 'sub_stripe_1',
  externalCustomerId: 'cus_1',
  currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
  currentPeriodEnd: new Date('2026-01-31T23:59:59.000Z'),
  cancelAtPeriodEnd: false,
  canceledAt: null,
  seats: 5,
  createdTime: new Date('2026-01-01T00:00:00.000Z'),
  updatedTime: new Date('2026-01-01T00:00:00.000Z'),
});

const buildPreview = (overrides: Partial<{
  metrics: Array<{ metric: string; overageCents: number; overageQuantity: bigint }>;
  addonMonthlyCostCents: number;
  periodStart: Date;
  periodEnd: Date;
}> = {}) => ({
  organizationId: 'org_1',
  periodStart: overrides.periodStart ?? new Date('2026-01-01T00:00:00.000Z'),
  periodEnd: overrides.periodEnd ?? new Date('2026-01-31T23:59:59.000Z'),
  currency: 'usd',
  metrics: overrides.metrics ?? [],
  totalCents: 0,
  addonMonthlyCostCents: overrides.addonMonthlyCostCents ?? 0,
  grandTotalCents: 0,
});

const buildService = (
  prisma: IMockPrisma,
  metered: IMockMeteredInvoice,
  cache: IMockPdfCache
): BillingInvoicePdfService =>
  new BillingInvoicePdfService(
    prisma as unknown as ConstructorParameters<typeof BillingInvoicePdfService>[0],
    metered as unknown as ConstructorParameters<typeof BillingInvoicePdfService>[1],
    cache as unknown as ConstructorParameters<typeof BillingInvoicePdfService>[2]
  );

describe('BillingInvoicePdfService (Phase 5.4 续)', () => {
  let prisma: IMockPrisma;
  let metered: IMockMeteredInvoice;
  let cache: IMockPdfCache;

  beforeEach(() => {
    prisma = {
      invoice: { findUnique: vi.fn() },
      subscription: { findUnique: vi.fn() },
    };
    metered = { previewMeteredInvoice: vi.fn() };
    cache = {
      latestExport: vi.fn().mockResolvedValue(null),
      storeExport: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('R-PDF-1: missing invoiceId raises NotFound', async () => {
    const svc = buildService(prisma, metered, cache);
    await expect(svc.renderInvoice({ invoiceId: '', organizationId: 'org_1' })).rejects.toThrow(
      /invoiceId is required/
    );
  });

  it('R-PDF-2: missing organizationId raises NotFound', async () => {
    const svc = buildService(prisma, metered, cache);
    await expect(svc.renderInvoice({ invoiceId: 'inv_1', organizationId: '' })).rejects.toThrow(
      /organizationId is required/
    );
  });

  it('R-PDF-3: invoice not found raises NotFound (no leakage)', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce(null);
    const svc = buildService(prisma, metered, cache);
    await expect(svc.renderInvoice({ invoiceId: 'inv_x', organizationId: 'org_1' })).rejects.toThrow(
      /invoice not found/
    );
    expect(prisma.subscription.findUnique).not.toHaveBeenCalled();
  });

  it('R-PDF-4: invoice belonging to a different org raises NotFound (not 403)', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice());
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription({ organizationId: 'org_other' }));
    const svc = buildService(prisma, metered, cache);
    await expect(svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1' })).rejects.toThrow(
      /invoice not found/
    );
    expect(metered.previewMeteredInvoice).not.toHaveBeenCalled();
  });

  it('R-PDF-5: subscription missing raises NotFound (defensive)', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice());
    prisma.subscription.findUnique.mockResolvedValueOnce(null);
    const svc = buildService(prisma, metered, cache);
    await expect(svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1' })).rejects.toThrow(
      /invoice not found/
    );
  });

  it('R-PDF-6: with metered overage, one line per overage metric is rendered', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice({ amountCents: 500 }));
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(
      buildPreview({
        metrics: [
          { metric: 'ai_credits', overageCents: 300, overageQuantity: 30_000n },
          { metric: 'automation_runs', overageCents: 200, overageQuantity: 4_000n },
          { metric: 'records', overageCents: 0, overageQuantity: 0n }, // zero overage → skipped
        ],
        addonMonthlyCostCents: 0,
      })
    );
    const svc = buildService(prisma, metered, cache);
    const out = await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS });
    expect(out.doc.size).toBeGreaterThan(0);
    expect(out.summary.lineCount).toBe(2);
    expect(out.summary.subtotalCents).toBe(500);
    expect(out.warnings).toEqual([]);
  });

  it('R-PDF-7: add-on monthly cost becomes one extra line item', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice({ amountCents: 1500 }));
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(
      buildPreview({
        metrics: [{ metric: 'ai_credits', overageCents: 500, overageQuantity: 50_000n }],
        addonMonthlyCostCents: 1000,
      })
    );
    const svc = buildService(prisma, metered, cache);
    const out = await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS });
    expect(out.summary.lineCount).toBe(2);
    expect(out.summary.subtotalCents).toBe(1500);
  });

  it('R-PDF-8: empty preview emits a single fallback line so the PDF still validates', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice({ amountCents: 999 }));
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(buildPreview());
    const svc = buildService(prisma, metered, cache);
    const out = await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS });
    expect(out.summary.lineCount).toBe(1);
    expect(out.summary.subtotalCents).toBe(999);
  });

  it('R-PDF-9: lowercase currency "usd" is normalized to "USD"', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice({ currency: 'eur' }));
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(buildPreview());
    const svc = buildService(prisma, metered, cache);
    const out = await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS });
    expect(out.summary.currency).toBe('EUR');
  });

  it('R-PDF-10: unknown currency falls back to USD instead of throwing', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice({ currency: 'btc' }));
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(buildPreview());
    const svc = buildService(prisma, metered, cache);
    const out = await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS });
    expect(out.summary.currency).toBe('USD');
  });

  it('R-PDF-11: rate cards default to empty array when not provided', async () => {
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice());
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(buildPreview());
    const svc = buildService(prisma, metered, cache);
    await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1' });
    expect(metered.previewMeteredInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ rateCards: [] })
    );
  });

  it('R-PDF-12: preview window matches the invoice period (periodStart, periodEnd)', async () => {
    const periodStart = new Date('2026-03-01T00:00:00.000Z');
    const periodEnd = new Date('2026-03-31T23:59:59.000Z');
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice({ periodStart, periodEnd }));
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(buildPreview({ periodStart, periodEnd }));
    const svc = buildService(prisma, metered, cache);
    await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS });
    const call = metered.previewMeteredInvoice.mock.calls[0]?.[0];
    expect(call.periodStart).toEqual(periodStart);
    expect(call.periodEnd).toEqual(periodEnd);
  });

  // ─── PDF cache (Round 29) ────────────────────────────────────────

  it('R-PDF-13: cache hit short-circuits render and returns cached bytes', async () => {
    const cachedBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"
    const cachedSha = 'a'.repeat(64);
    cache.latestExport.mockResolvedValueOnce({ bytes: cachedBytes, sha256: cachedSha });
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice());
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(buildPreview());
    const svc = buildService(prisma, metered, cache);
    const out = await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS });
    expect(out.doc.bytes).toBe(cachedBytes);
    expect(out.doc.sha256).toBe(cachedSha);
    expect(out.doc.size).toBe(cachedBytes.byteLength);
    expect(out.pageCount).toBe(0);
    expect(out.warnings).toEqual([]);
    // Store should NOT be called on cache hit
    expect(cache.storeExport).not.toHaveBeenCalled();
  });

  it('R-PDF-14: cache miss renders fresh and writes the export', async () => {
    cache.latestExport.mockResolvedValueOnce(null);
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice());
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(buildPreview());
    const svc = buildService(prisma, metered, cache);
    const out = await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS });
    expect(out.doc.size).toBeGreaterThan(0);
    expect(out.pageCount).toBeGreaterThan(0);
    expect(cache.storeExport).toHaveBeenCalledTimes(1);
    const storeArg = cache.storeExport.mock.calls[0]?.[0];
    expect(storeArg.invoiceId).toBe('inv_1');
    expect(storeArg.doc.size).toBe(out.doc.size);
    expect(storeArg.doc.sha256).toBe(out.doc.sha256);
  });

  it('R-PDF-15: fresh=true bypasses cache lookup and re-renders', async () => {
    cache.latestExport.mockResolvedValueOnce({ bytes: new Uint8Array([1]), sha256: 'b'.repeat(64) });
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice());
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(buildPreview());
    const svc = buildService(prisma, metered, cache);
    const out = await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS, fresh: true });
    expect(out.doc.size).toBeGreaterThan(100);
    expect(out.pageCount).toBeGreaterThan(0);
    expect(cache.latestExport).not.toHaveBeenCalled();
    expect(cache.storeExport).toHaveBeenCalledTimes(1);
  });

  it('R-PDF-16: cache hit summary is recomputed from current metered preview', async () => {
    cache.latestExport.mockResolvedValueOnce({
      bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      sha256: 'c'.repeat(64),
    });
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice({ amountCents: 777 }));
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(buildPreview());
    const svc = buildService(prisma, metered, cache);
    const out = await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS });
    expect(out.summary.subtotalCents).toBe(777);
    expect(out.summary.lineCount).toBe(1);
  });

  it('R-PDF-17: storeExport failure does not break the response (cache write is best-effort)', async () => {
    cache.latestExport.mockResolvedValueOnce(null);
    cache.storeExport.mockRejectedValueOnce(new Error('db unavailable'));
    prisma.invoice.findUnique.mockResolvedValueOnce(buildInvoice());
    prisma.subscription.findUnique.mockResolvedValueOnce(buildSubscription());
    metered.previewMeteredInvoice.mockResolvedValueOnce(buildPreview());
    const svc = buildService(prisma, metered, cache);
    const out = await svc.renderInvoice({ invoiceId: 'inv_1', organizationId: 'org_1', rateCards: RATE_CARDS });
    expect(out.doc.size).toBeGreaterThan(0);
    expect(out.pageCount).toBeGreaterThan(0);
  });
});
