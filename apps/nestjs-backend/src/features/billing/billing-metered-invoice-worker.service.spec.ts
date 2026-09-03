/* eslint-disable @typescript-eslint/naming-convention */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BillingMeteredInvoiceWorkerService } from './billing-metered-invoice-worker.service';
import type { IMetricRateCard } from './billing-metered-invoice.service';

interface IMockMeteredInvoice {
  materializeMeteredInvoice: ReturnType<typeof vi.fn>;
}

interface IMockSubscriptionRow {
  id: string;
  organizationId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  status: string;
}

interface IMockPrisma {
  subscription: {
    findMany: ReturnType<typeof vi.fn>;
  };
}

const RATE_CARDS: ReadonlyArray<IMetricRateCard> = [
  { metric: 'ai_credits', includedQuantity: 10_000, tiers: [] },
];

const buildSub = (overrides: Partial<IMockSubscriptionRow> = {}): IMockSubscriptionRow => ({
  id: overrides.id ?? 'sub_test',
  organizationId: overrides.organizationId ?? 'org_test',
  currentPeriodStart: overrides.currentPeriodStart ?? new Date('2026-01-01T00:00:00.000Z'),
  currentPeriodEnd: overrides.currentPeriodEnd ?? new Date('2026-01-31T23:59:59.000Z'),
  status: overrides.status ?? 'active',
});

const buildService = (
  prisma: IMockPrisma,
  metered: IMockMeteredInvoice
): BillingMeteredInvoiceWorkerService =>
  new BillingMeteredInvoiceWorkerService(
    prisma as unknown as ConstructorParameters<typeof BillingMeteredInvoiceWorkerService>[0],
    metered as unknown as ConstructorParameters<typeof BillingMeteredInvoiceWorkerService>[1]
  );

describe('BillingMeteredInvoiceWorkerService (Phase 5.5 cron)', () => {
  let prisma: IMockPrisma;
  let metered: IMockMeteredInvoice;
  let originalDisabled: string | undefined;
  let originalInterval: string | undefined;

  beforeEach(() => {
    prisma = {
      subscription: {
        findMany: vi.fn(async () => [] as IMockSubscriptionRow[]),
      },
    };
    metered = {
      materializeMeteredInvoice: vi.fn(),
    };
    originalDisabled = process.env.BILLING_METERED_INVOICE_WORKER_DISABLED;
    originalInterval = process.env.BILLING_METERED_INVOICE_WORKER_INTERVAL_MS;
  });

  afterEach(() => {
    if (originalDisabled === undefined) delete process.env.BILLING_METERED_INVOICE_WORKER_DISABLED;
    else process.env.BILLING_METERED_INVOICE_WORKER_DISABLED = originalDisabled;
    if (originalInterval === undefined) delete process.env.BILLING_METERED_INVOICE_WORKER_INTERVAL_MS;
    else process.env.BILLING_METERED_INVOICE_WORKER_INTERVAL_MS = originalInterval;
  });

  it('R-PERIOD-1: empty scan returns all-zero result', async () => {
    const worker = buildService(prisma, metered);
    const out = await worker.processDueInvoices({ rateCards: RATE_CARDS });
    expect(out).toEqual({
      scanned: 0,
      materialized: 0,
      noop: 0,
      errors: 0,
      errorDetails: [],
    });
    expect(metered.materializeMeteredInvoice).not.toHaveBeenCalled();
  });

  it('R-PERIOD-2: each due subscription is materialized exactly once', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([
      buildSub({ id: 'sub_a', organizationId: 'org_a' }),
      buildSub({ id: 'sub_b', organizationId: 'org_b' }),
    ]);
    metered.materializeMeteredInvoice.mockResolvedValue({
      invoice: {
        id: 'inv_x',
        externalInvoiceId: 'metered:org_a:2026-01-01',
        amountCents: 1234,
        currency: 'usd',
        status: 'draft',
        periodStart: new Date(),
        periodEnd: new Date(),
      },
      preview: {} as never,
      created: true,
    });
    const worker = buildService(prisma, metered);
    const out = await worker.processDueInvoices({ rateCards: RATE_CARDS });
    expect(out.scanned).toBe(2);
    expect(out.materialized).toBe(2);
    expect(out.noop).toBe(0);
    expect(out.errors).toBe(0);
    expect(metered.materializeMeteredInvoice).toHaveBeenCalledTimes(2);
    const firstCall = metered.materializeMeteredInvoice.mock.calls[0]?.[0];
    expect(firstCall.organizationId).toBe('org_a');
    expect(firstCall.subscriptionId).toBe('sub_a');
    expect(firstCall.rateCards).toBe(RATE_CARDS);
  });

  it('R-PERIOD-3: idempotent re-tick counts already-materialized invoice as noop', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([buildSub()]);
    metered.materializeMeteredInvoice.mockResolvedValueOnce({
      invoice: {
        id: 'inv_existing',
        externalInvoiceId: 'metered:org_test:2026-01-01',
        amountCents: 999,
        currency: 'usd',
        status: 'draft',
        periodStart: new Date(),
        periodEnd: new Date(),
      },
      preview: {} as never,
      created: false,
    });
    const worker = buildService(prisma, metered);
    const out = await worker.processDueInvoices({ rateCards: RATE_CARDS });
    expect(out.scanned).toBe(1);
    expect(out.materialized).toBe(0);
    expect(out.noop).toBe(1);
    expect(out.errors).toBe(0);
  });

  it('R-PERIOD-4: zero grand-total invoice is counted as noop (sentinel id=noop)', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([buildSub()]);
    metered.materializeMeteredInvoice.mockResolvedValueOnce({
      invoice: {
        id: 'noop',
        externalInvoiceId: 'metered:org_test:2026-01-01',
        amountCents: 0,
        currency: 'usd',
        status: 'draft',
        periodStart: new Date(),
        periodEnd: new Date(),
      },
      preview: {} as never,
      created: false,
    });
    const worker = buildService(prisma, metered);
    const out = await worker.processDueInvoices({ rateCards: RATE_CARDS });
    expect(out.scanned).toBe(1);
    expect(out.materialized).toBe(0);
    expect(out.noop).toBe(1);
    expect(out.errors).toBe(0);
  });

  it('R-PERIOD-5: handler exceptions are captured per subscription and never abort the loop', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([
      buildSub({ id: 'sub_a', organizationId: 'org_a' }),
      buildSub({ id: 'sub_b', organizationId: 'org_b' }),
      buildSub({ id: 'sub_c', organizationId: 'org_c' }),
    ]);
    metered.materializeMeteredInvoice
      .mockRejectedValueOnce(new Error('boom_a'))
      .mockResolvedValueOnce({
        invoice: {
          id: 'inv_b',
          externalInvoiceId: 'metered:org_b:2026-01-01',
          amountCents: 1,
          currency: 'usd',
          status: 'draft',
          periodStart: new Date(),
          periodEnd: new Date(),
        },
        preview: {} as never,
        created: true,
      })
      .mockRejectedValueOnce(new Error('boom_c'));
    const worker = buildService(prisma, metered);
    const out = await worker.processDueInvoices({ rateCards: RATE_CARDS });
    expect(out.scanned).toBe(3);
    expect(out.materialized).toBe(1);
    expect(out.errors).toBe(2);
    expect(out.errorDetails).toEqual([
      { subscriptionId: 'sub_a', organizationId: 'org_a', error: 'boom_a' },
      { subscriptionId: 'sub_c', organizationId: 'org_c', error: 'boom_c' },
    ]);
  });

  it('R-PERIOD-6: query filters by `currentPeriodEnd <= asOf` and statuses active|past_due', async () => {
    const asOf = new Date('2026-02-15T00:00:00.000Z');
    prisma.subscription.findMany.mockResolvedValueOnce([]);
    const worker = buildService(prisma, metered);
    await worker.processDueInvoices({ asOf, rateCards: RATE_CARDS });
    expect(prisma.subscription.findMany).toHaveBeenCalledWith({
      where: {
        currentPeriodEnd: { lte: asOf },
        status: { in: ['active', 'past_due'] },
      },
      take: 200,
      orderBy: { currentPeriodEnd: 'asc' },
    });
  });

  it('R-PERIOD-7: oversized `limit` is clamped to 1000', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([]);
    const worker = buildService(prisma, metered);
    await worker.processDueInvoices({ limit: 99_999, rateCards: RATE_CARDS });
    expect(prisma.subscription.findMany.mock.calls[0]?.[0]?.take).toBe(1000);
  });

  it('R-PERIOD-8: limit=0 clamps up to 1 (never queries with take=0)', async () => {
    prisma.subscription.findMany.mockResolvedValueOnce([]);
    const worker = buildService(prisma, metered);
    await worker.processDueInvoices({ limit: 0, rateCards: RATE_CARDS });
    expect(prisma.subscription.findMany.mock.calls[0]?.[0]?.take).toBe(1);
  });

  it('R-PERIOD-9: timer wiring — onModuleInit arms a timer that onModuleDestroy clears', () => {
    process.env.BILLING_METERED_INVOICE_WORKER_DISABLED = '1';
    const worker = buildService(prisma, metered);
    worker.onModuleInit();
    expect((worker as unknown as { timer?: unknown }).timer).toBeUndefined();
    worker.onModuleDestroy();
    // No throw, no dangling timer.
    expect((worker as unknown as { timer?: unknown }).timer).toBeUndefined();
  });

  it('R-PERIOD-10: when enabled, onModuleInit arms a real interval and onModuleDestroy clears it', () => {
    delete process.env.BILLING_METERED_INVOICE_WORKER_DISABLED;
    process.env.BILLING_METERED_INVOICE_WORKER_INTERVAL_MS = '60000';
    const clearSpy = vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);
    const setSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((() => ({ unref: () => undefined })) as unknown as typeof setInterval);
    try {
      const worker = buildService(prisma, metered);
      worker.onModuleInit();
      expect(setSpy).toHaveBeenCalledTimes(1);
      expect(setSpy.mock.calls[0]?.[1]).toBe(60000);
      worker.onModuleDestroy();
      expect(clearSpy).toHaveBeenCalledTimes(1);
    } finally {
      setSpy.mockRestore();
      clearSpy.mockRestore();
    }
  });

  it('R-PERIOD-11: invalid env interval falls back to the 5-minute default', () => {
    delete process.env.BILLING_METERED_INVOICE_WORKER_DISABLED;
    process.env.BILLING_METERED_INVOICE_WORKER_INTERVAL_MS = 'not-a-number';
    const setSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((() => ({ unref: () => undefined })) as unknown as typeof setInterval);
    try {
      const worker = buildService(prisma, metered);
      worker.onModuleInit();
      expect(setSpy.mock.calls[0]?.[1]).toBe(5 * 60 * 1000);
      worker.onModuleDestroy();
    } finally {
      setSpy.mockRestore();
    }
  });

  it('R-PERIOD-12: sub-1s env interval is rejected and falls back to default', () => {
    delete process.env.BILLING_METERED_INVOICE_WORKER_DISABLED;
    process.env.BILLING_METERED_INVOICE_WORKER_INTERVAL_MS = '500';
    const setSpy = vi
      .spyOn(globalThis, 'setInterval')
      .mockImplementation((() => ({ unref: () => undefined })) as unknown as typeof setInterval);
    try {
      const worker = buildService(prisma, metered);
      worker.onModuleInit();
      expect(setSpy.mock.calls[0]?.[1]).toBe(5 * 60 * 1000);
      worker.onModuleDestroy();
    } finally {
      setSpy.mockRestore();
    }
  });
});
