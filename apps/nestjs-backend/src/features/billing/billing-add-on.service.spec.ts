/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { BillingAddOnService } from './billing-add-on.service';

interface IMockAddOnTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  billingAddOn: IMockAddOnTable;
}

const buildPrisma = (): IMockPrisma => ({
  billingAddOn: {
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      organizationId: data.organizationId,
      metric: data.metric,
      packCode: data.packCode,
      grantedQuantity: data.grantedQuantity,
      monthlyPriceCents: data.monthlyPriceCents,
      currency: data.currency,
      status: data.status,
      currentPeriodStart: data.currentPeriodStart,
      currentPeriodEnd: data.currentPeriodEnd,
      canceledAt: data.canceledAt ?? null,
      createdTime: new Date('2026-01-01T00:00:00.000Z'),
      updatedTime: new Date('2026-01-01T00:00:00.000Z'),
    })),
    update: vi.fn(async ({ where, data }) => ({
      id: where.id,
      organizationId: 'org_test',
      metric: 'ai_credits',
      packCode: 'pack_test',
      grantedQuantity: 100n,
      monthlyPriceCents: 1000,
      currency: 'usd',
      status: data.status,
      currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
      canceledAt: data.canceledAt ?? null,
      createdTime: new Date('2026-01-01T00:00:00.000Z'),
      updatedTime: new Date('2026-01-01T00:00:00.000Z'),
    })),
    updateMany: vi.fn(async () => ({ count: 0 })),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
});

const descriptor = {
  packCode: 'ai-credits-100k',
  metric: 'ai_credits' as const,
  grantedQuantity: 100_000,
  monthlyPriceCents: 1900,
};

describe('BillingAddOnService (Phase 5.5 part 2)', () => {
  let prisma: IMockPrisma;
  let svc: BillingAddOnService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new BillingAddOnService(prisma as never);
  });

  describe('activate', () => {
    it('creates an active add-on row', async () => {
      const out = await svc.activate({
        organizationId: 'org_a',
        descriptor,
        periodStart: new Date('2026-09-01T00:00:00Z'),
        periodEnd: new Date('2026-10-01T00:00:00Z'),
      });
      expect(out.status).toBe('active');
      expect(out.packCode).toBe('ai-credits-100k');
      expect(out.grantedQuantity).toBe(100_000n);
      expect(prisma.billingAddOn.create).toHaveBeenCalledTimes(1);
    });

    it('returns the existing row when (org, pack, periodStart) is already present', async () => {
      prisma.billingAddOn.findFirst.mockResolvedValueOnce({
        id: 'addon_existing',
        organizationId: 'org_a',
        metric: 'ai_credits',
        packCode: 'ai-credits-100k',
        grantedQuantity: 100_000n,
        monthlyPriceCents: 1900,
        currency: 'usd',
        status: 'active',
        currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
        canceledAt: null,
        createdTime: new Date('2026-01-01T00:00:00.000Z'),
        updatedTime: new Date('2026-01-01T00:00:00.000Z'),
      });
      const out = await svc.activate({
        organizationId: 'org_a',
        descriptor,
        periodStart: new Date('2026-09-01T00:00:00Z'),
      });
      expect(out.id).toBe('addon_existing');
      expect(prisma.billingAddOn.create).not.toHaveBeenCalled();
    });

    it('rejects negative grantedQuantity', async () => {
      await expect(
        svc.activate({
          organizationId: 'org_a',
          descriptor: { ...descriptor, grantedQuantity: -1 },
        })
      ).rejects.toThrow(/non-negative/);
    });

    it('rejects negative monthlyPriceCents', async () => {
      await expect(
        svc.activate({
          organizationId: 'org_a',
          descriptor: { ...descriptor, monthlyPriceCents: -1 },
        })
      ).rejects.toThrow(/non-negative/);
    });
  });

  describe('cancel', () => {
    it('atPeriodEnd=true marks the row canceled but keeps it visible', async () => {
      prisma.billingAddOn.findFirst.mockResolvedValueOnce({
        id: 'addon_x',
        organizationId: 'org_a',
        metric: 'ai_credits',
        packCode: 'ai-credits-100k',
        grantedQuantity: 100_000n,
        monthlyPriceCents: 1900,
        currency: 'usd',
        status: 'active',
        currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
        canceledAt: null,
        createdTime: new Date('2026-01-01T00:00:00.000Z'),
        updatedTime: new Date('2026-01-01T00:00:00.000Z'),
      });
      const out = await svc.cancel({
        organizationId: 'org_a',
        packCode: 'ai-credits-100k',
        atPeriodEnd: true,
      });
      expect(out?.status).toBe('canceled');
      expect(prisma.billingAddOn.update).toHaveBeenCalledWith({
        where: { id: 'addon_x' },
        data: { status: 'canceled', canceledAt: expect.any(Date) },
      });
    });

    it('atPeriodEnd=false flips straight to expired', async () => {
      prisma.billingAddOn.findFirst.mockResolvedValueOnce({
        id: 'addon_x',
        organizationId: 'org_a',
        metric: 'ai_credits',
        packCode: 'ai-credits-100k',
        grantedQuantity: 100_000n,
        monthlyPriceCents: 1900,
        currency: 'usd',
        status: 'active',
        currentPeriodStart: new Date('2026-09-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
        canceledAt: null,
        createdTime: new Date('2026-01-01T00:00:00.000Z'),
        updatedTime: new Date('2026-01-01T00:00:00.000Z'),
      });
      const out = await svc.cancel({
        organizationId: 'org_a',
        packCode: 'ai-credits-100k',
        atPeriodEnd: false,
      });
      expect(out?.status).toBe('expired');
    });

    it('returns null when no active row exists', async () => {
      const out = await svc.cancel({
        organizationId: 'org_a',
        packCode: 'ai-credits-100k',
        atPeriodEnd: true,
      });
      expect(out).toBeNull();
      expect(prisma.billingAddOn.update).not.toHaveBeenCalled();
    });
  });

  describe('expireDue', () => {
    it('transitions active rows whose periodEnd has elapsed', async () => {
      prisma.billingAddOn.findMany.mockResolvedValueOnce([
        { id: 'addon_a' },
        { id: 'addon_b' },
      ]);
      prisma.billingAddOn.updateMany.mockResolvedValueOnce({ count: 2 });
      const n = await svc.expireDue({ asOf: new Date('2026-12-01T00:00:00Z') });
      expect(n).toBe(2);
      expect(prisma.billingAddOn.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['addon_a', 'addon_b'] } },
        data: { status: 'expired' },
      });
    });

    it('returns 0 and skips the update when no rows are due', async () => {
      const n = await svc.expireDue();
      expect(n).toBe(0);
      expect(prisma.billingAddOn.updateMany).not.toHaveBeenCalled();
    });

    it('clamps the limit to 1000', async () => {
      prisma.billingAddOn.findMany.mockResolvedValueOnce([]);
      await svc.expireDue({ limit: 99999 });
      expect(prisma.billingAddOn.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 1000 })
      );
    });
  });

  describe('previewMonthlyCost', () => {
    it('sums monthlyPriceCents across active rows', async () => {
      prisma.billingAddOn.findMany.mockResolvedValueOnce([
        {
          id: 'a',
          organizationId: 'org_a',
          metric: 'ai_credits',
          packCode: 'p1',
          grantedQuantity: 100n,
          monthlyPriceCents: 1900,
          currency: 'usd',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          canceledAt: null,
          createdTime: new Date(),
          updatedTime: new Date(),
        },
        {
          id: 'b',
          organizationId: 'org_a',
          metric: 'automation_runs',
          packCode: 'p2',
          grantedQuantity: 500n,
          monthlyPriceCents: 900,
          currency: 'usd',
          status: 'active',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(),
          canceledAt: null,
          createdTime: new Date(),
          updatedTime: new Date(),
        },
      ]);
      const out = await svc.previewMonthlyCost({ organizationId: 'org_a' });
      expect(out.totalCents).toBe(2800);
      expect(out.activeCount).toBe(2);
    });

    it('returns 0 when no active add-ons exist', async () => {
      const out = await svc.previewMonthlyCost({ organizationId: 'org_a' });
      expect(out.totalCents).toBe(0);
      expect(out.activeCount).toBe(0);
    });
  });

  describe('totalGrantedQuantity', () => {
    it('sums grantedQuantity across active rows for one metric', async () => {
      prisma.billingAddOn.findMany.mockResolvedValueOnce([
        { grantedQuantity: 100_000n },
        { grantedQuantity: 50_000n },
      ]);
      const out = await svc.totalGrantedQuantity({
        organizationId: 'org_a',
        metric: 'ai_credits',
        asOf: new Date('2026-09-15T00:00:00Z'),
      });
      expect(out).toBe(150_000n);
      expect(prisma.billingAddOn.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org_a',
          metric: 'ai_credits',
          status: 'active',
          currentPeriodStart: { lte: new Date('2026-09-15T00:00:00Z') },
          currentPeriodEnd: { gt: new Date('2026-09-15T00:00:00Z') },
        },
        select: { grantedQuantity: true },
      });
    });

    it('returns 0n when no active rows match', async () => {
      const out = await svc.totalGrantedQuantity({
        organizationId: 'org_a',
        metric: 'ai_credits',
      });
      expect(out).toBe(0n);
    });
  });

  describe('listForOrg', () => {
    it('returns rows for the org in createdTime-desc order', async () => {
      prisma.billingAddOn.findMany.mockResolvedValueOnce([]);
      const out = await svc.listForOrg({ organizationId: 'org_a' });
      expect(out).toEqual([]);
      expect(prisma.billingAddOn.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org_a' },
        orderBy: { createdTime: 'desc' },
      });
    });
  });
});
