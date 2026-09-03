/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { BillingMeteredInvoiceService } from './billing-metered-invoice.service';

interface IMockInvoiceTable {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  invoice: IMockInvoiceTable;
}
interface IMockLedger {
  aggregate: ReturnType<typeof vi.fn>;
  previewOverage: ReturnType<typeof vi.fn>;
}
interface IMockAddOn {
  totalGrantedQuantity: ReturnType<typeof vi.fn>;
  previewMonthlyCost: ReturnType<typeof vi.fn>;
}

const buildPrisma = (): IMockPrisma => ({
  invoice: {
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      subscriptionId: data.subscriptionId,
      externalInvoiceId: data.externalInvoiceId,
      amountCents: data.amountCents,
      currency: data.currency,
      status: data.status,
      issuedAt: data.issuedAt,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      paidAt: data.paidAt ?? null,
    })),
    findUnique: vi.fn(async () => null),
  },
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

const buildAddOn = (): IMockAddOn => ({
  totalGrantedQuantity: vi.fn(async () => 0n),
  previewMonthlyCost: vi.fn(async () => ({ totalCents: 0, currency: 'usd', activeCount: 0, addOns: [] })),
});

const periodStart = new Date('2026-09-01T00:00:00.000Z');
const periodEnd = new Date('2026-10-01T00:00:00.000Z');

const rateCards = [
  {
    metric: 'ai_credits' as const,
    includedQuantity: 1000,
    tiers: [{ threshold: 10000, unitCents: 1 }],
  },
  {
    metric: 'automation_runs' as const,
    includedQuantity: 100,
    tiers: [{ threshold: 1000, unitCents: 5 }],
  },
];

describe('BillingMeteredInvoiceService (Phase 5.5 part 3)', () => {
  let prisma: IMockPrisma;
  let ledger: IMockLedger;
  let addOn: IMockAddOn;
  let svc: BillingMeteredInvoiceService;

  beforeEach(() => {
    prisma = buildPrisma();
    ledger = buildLedger();
    addOn = buildAddOn();
    svc = new BillingMeteredInvoiceService(
      prisma as never,
      ledger as never,
      addOn as never
    );
  });

  describe('previewMeteredInvoice', () => {
    it('aggregates across all four metrics and sums overage cents', async () => {
      ledger.aggregate
        .mockResolvedValueOnce({ totalQuantity: 5500n, eventCount: 3 })
        .mockResolvedValueOnce({ totalQuantity: 350n, eventCount: 2 });
      ledger.previewOverage
        // ai_credits: included 1000 + addon 0 = 1000; total 5500 → overage 4500 @ 1¢ = 4500
        .mockResolvedValueOnce({
          overageQuantity: 4500n,
          overageCents: 4500,
          currency: 'usd',
          tierBreakdown: [
            {
              fromInclusive: 1001n,
              toInclusive: 10000n,
              unitCents: 1,
              units: 4500n,
              cents: 4500,
            },
          ],
        })
        // automation_runs: included 100 + addon 0 = 100; total 350 → overage 250 @ 5¢ = 1250
        .mockResolvedValueOnce({
          overageQuantity: 250n,
          overageCents: 1250,
          currency: 'usd',
          tierBreakdown: [],
        });
      addOn.totalGrantedQuantity.mockResolvedValue(0n);

      const out = await svc.previewMeteredInvoice({
        organizationId: 'org_a',
        periodStart,
        periodEnd,
        rateCards,
      });

      expect(out.totalCents).toBe(4500 + 1250);
      expect(out.grandTotalCents).toBe(5750); // no add-ons
      expect(out.metrics).toHaveLength(2);
      expect(out.metrics[0].metric).toBe('ai_credits');
      expect(out.metrics[0].overageCents).toBe(4500);
      expect(out.metrics[1].metric).toBe('automation_runs');
      expect(out.metrics[1].overageCents).toBe(1250);
    });

    it('adds active add-on monthly cost to the grand total', async () => {
      addOn.previewMonthlyCost.mockResolvedValueOnce({
        totalCents: 2800,
        currency: 'usd',
        activeCount: 2,
        addOns: [],
      });
      // totals: 0 overage + 2800 add-ons = 2800
      const out = await svc.previewMeteredInvoice({
        organizationId: 'org_a',
        periodStart,
        periodEnd,
        rateCards: [],
      });
      expect(out.totalCents).toBe(0);
      expect(out.addonMonthlyCostCents).toBe(2800);
      expect(out.grandTotalCents).toBe(2800);
    });

    it('passes addon granted quantity into effective included', async () => {
      ledger.aggregate.mockResolvedValueOnce({ totalQuantity: 1500n, eventCount: 1 });
      ledger.previewOverage.mockResolvedValueOnce({
        overageQuantity: 0n,
        overageCents: 0,
        currency: 'usd',
        tierBreakdown: [],
      });
      addOn.totalGrantedQuantity.mockResolvedValueOnce(500n);

      await svc.previewMeteredInvoice({
        organizationId: 'org_a',
        periodStart,
        periodEnd,
        rateCards: [{ metric: 'ai_credits', includedQuantity: 1000, tiers: [] }],
      });
      // addon grants 500, base includes 1000 → effectiveIncluded = 1500
      // so total 1500 = no overage
      expect(ledger.previewOverage).toHaveBeenCalledWith(
        expect.objectContaining({ includedQuantity: 1500n })
      );
    });

    it('rejects periodEnd <= periodStart', async () => {
      await expect(
        svc.previewMeteredInvoice({
          organizationId: 'org_a',
          periodStart,
          periodEnd: periodStart,
          rateCards: [],
        })
      ).rejects.toThrow(/periodEnd must be strictly after periodStart/);
    });
  });

  describe('materializeMeteredInvoice', () => {
    it('writes a draft invoice when grandTotal > 0', async () => {
      addOn.previewMonthlyCost.mockResolvedValueOnce({
        totalCents: 0,
        currency: 'usd',
        activeCount: 0,
        addOns: [],
      });
      ledger.previewOverage.mockResolvedValueOnce({
        overageQuantity: 500n,
        overageCents: 500,
        currency: 'usd',
        tierBreakdown: [],
      });
      ledger.aggregate.mockResolvedValueOnce({ totalQuantity: 1500n, eventCount: 1 });

      const out = await svc.materializeMeteredInvoice({
        organizationId: 'org_a',
        subscriptionId: 'sub_a',
        periodStart,
        periodEnd,
        rateCards: [{ metric: 'ai_credits', includedQuantity: 1000, tiers: [{ threshold: 5000, unitCents: 1 }] }],
      });

      expect(out.created).toBe(true);
      expect(out.invoice.amountCents).toBe(500);
      expect(out.invoice.status).toBe('draft');
      expect(out.invoice.externalInvoiceId).toBe(
        `metered:org_a:${periodStart.toISOString()}`
      );
      expect(prisma.invoice.create).toHaveBeenCalledTimes(1);
    });

    it('returns a noop sentinel when grandTotal === 0 (no row written)', async () => {
      const out = await svc.materializeMeteredInvoice({
        organizationId: 'org_a',
        subscriptionId: 'sub_a',
        periodStart,
        periodEnd,
        rateCards: [],
      });
      expect(out.created).toBe(false);
      expect(out.invoice.id).toBe('noop');
      expect(out.invoice.amountCents).toBe(0);
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('returns the existing row when externalInvoiceId is already present', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({
        id: 'inv_existing',
        subscriptionId: 'sub_a',
        externalInvoiceId: `metered:org_a:${periodStart.toISOString()}`,
        amountCents: 1500,
        currency: 'usd',
        status: 'draft',
        issuedAt: periodStart,
        periodStart,
        periodEnd,
        paidAt: null,
      });
      const out = await svc.materializeMeteredInvoice({
        organizationId: 'org_a',
        subscriptionId: 'sub_a',
        periodStart,
        periodEnd,
        rateCards: [],
      });
      expect(out.created).toBe(false);
      expect(out.invoice.id).toBe('inv_existing');
      expect(prisma.invoice.create).not.toHaveBeenCalled();
    });

    it('honors a caller-supplied externalInvoiceId', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce(null);
      addOn.previewMonthlyCost.mockResolvedValueOnce({
        totalCents: 100,
        currency: 'usd',
        activeCount: 1,
        addOns: [],
      });
      const out = await svc.materializeMeteredInvoice({
        organizationId: 'org_a',
        subscriptionId: 'sub_a',
        periodStart,
        periodEnd,
        rateCards: [],
        externalInvoiceId: 'manual:custom-key',
      });
      expect(out.invoice.externalInvoiceId).toBe('manual:custom-key');
      expect(prisma.invoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ externalInvoiceId: 'manual:custom-key' }),
        })
      );
    });
  });
});
