/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { OrgBillingRollupAuthService } from './org-billing-rollup.auth.service';
import type { IBillingCredit, IBillingLineItem, IBillingRollup } from './org-billing-rollup.types';

function mkPrismaMock() {
  const lineItemUpsert = vi.fn();
  const lineItemFindMany = vi.fn();
  const creditUpsert = vi.fn();
  const creditFindMany = vi.fn();
  const rollupUpsert = vi.fn();
  const rollupFindUnique = vi.fn();
  const prisma = {
    billingLineItem: {
      upsert: lineItemUpsert,
      findMany: lineItemFindMany,
    },
    billingCredit: {
      upsert: creditUpsert,
      findMany: creditFindMany,
    },
    billingRollup: {
      upsert: rollupUpsert,
      findUnique: rollupFindUnique,
    },
  } as unknown as PrismaService;
  return {
    prisma,
    mocks: {
      lineItemUpsert,
      lineItemFindMany,
      creditUpsert,
      creditFindMany,
      rollupUpsert,
      rollupFindUnique,
    },
  };
}

const item = (over: Partial<IBillingLineItem> = {}): IBillingLineItem => ({
  id: 'li1',
  orgId: 'org1',
  baseId: 'base1',
  kind: 'subscription',
  incurredAt: '2026-01-15T00:00:00Z',
  quantity: 1,
  unitPriceMinor: 999,
  currency: 'USD',
  description: 'Pro plan',
  ...over,
});

const credit = (over: Partial<IBillingCredit> = {}): IBillingCredit => ({
  id: 'c1',
  orgId: 'org1',
  appliedAt: '2026-01-20T00:00:00Z',
  amountMinor: 500,
  currency: 'USD',
  reason: 'promo',
  ...over,
});

const lineItemRow = (over: Partial<IBillingLineItem> = {}) => ({
  ...item(over),
  incurredAt: new Date(over.incurredAt ?? '2026-01-15T00:00:00Z'),
});

const creditRow = (over: Partial<IBillingCredit> = {}) => ({
  ...credit(over),
  appliedAt: new Date(over.appliedAt ?? '2026-01-20T00:00:00Z'),
});

describe('OrgBillingRollupAuthService', () => {
  it('validate() delegates', () => {
    const { prisma } = mkPrismaMock();
    const svc = new OrgBillingRollupAuthService(prisma);
    expect(svc.validate(item())).toBeNull();
    expect(svc.validate(item({ quantity: -1 }))).toContain('quantity');
  });

  it('recordLineItem() persists', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.lineItemUpsert.mockResolvedValue({});
    const svc = new OrgBillingRollupAuthService(prisma);
    await svc.recordLineItem(item());
    expect(mocks.lineItemUpsert).toHaveBeenCalled();
  });

  it('recordLineItem() rejects invalid', async () => {
    const { prisma } = mkPrismaMock();
    const svc = new OrgBillingRollupAuthService(prisma);
    await expect(svc.recordLineItem(item({ quantity: -1 }))).rejects.toThrow();
  });

  it('listLineItems() maps rows', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.lineItemFindMany.mockResolvedValue([lineItemRow()]);
    const svc = new OrgBillingRollupAuthService(prisma);
    const out = await svc.listLineItems({ orgId: 'org1', period: '2026-01' });
    expect(out.length).toBe(1);
    expect(out[0]?.kind).toBe('subscription');
  });

  it('recordCredit() persists', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.creditUpsert.mockResolvedValue({});
    const svc = new OrgBillingRollupAuthService(prisma);
    await svc.recordCredit(credit());
    expect(mocks.creditUpsert).toHaveBeenCalled();
  });

  it('listCredits() maps rows', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.creditFindMany.mockResolvedValue([creditRow()]);
    const svc = new OrgBillingRollupAuthService(prisma);
    const out = await svc.listCredits('org1');
    expect(out.length).toBe(1);
  });

  it('produceRollup() pulls + consolidates + persists', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.lineItemFindMany.mockResolvedValue([lineItemRow()]);
    mocks.creditFindMany.mockResolvedValue([creditRow()]);
    mocks.rollupUpsert.mockResolvedValue({});
    const svc = new OrgBillingRollupAuthService(prisma);
    const r = await svc.produceRollup({
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
    });
    expect(r.grossMinor).toBe(999);
    expect(r.creditsMinor).toBe(500);
    expect(r.netMinor).toBe(499);
    expect(mocks.rollupUpsert).toHaveBeenCalled();
  });

  it('produceRollup() rejects when over cap', async () => {
    const { prisma, mocks } = mkPrismaMock();
    const big = Array.from({ length: 50_001 }, (_, i) =>
      lineItemRow({ id: `li${i}`, incurredAt: '2026-01-15T00:00:00Z' })
    );
    mocks.lineItemFindMany.mockResolvedValue(big);
    mocks.creditFindMany.mockResolvedValue([]);
    const svc = new OrgBillingRollupAuthService(prisma);
    await expect(
      svc.produceRollup({ orgId: 'org1', period: '2026-01', currency: 'USD' })
    ).rejects.toThrow();
  });

  it('loadRollup() returns mapped row', async () => {
    const { prisma, mocks } = mkPrismaMock();
    const rollup: Partial<IBillingRollup> & Record<string, unknown> = {
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
      grossMinor: 100,
      creditsMinor: 0,
      netMinor: 100,
      lineCount: 1,
      baseCount: 1,
      dunningLevel: 'current',
      byKind: {
        subscription: 0,
        'ai-credit': 0,
        'automation-run': 0,
        'webhook-delivery': 0,
        'byok-throughput': 0,
        'storage-overage': 0,
        'seat-addon': 0,
        'one-time-fee': 0,
      },
      generatedAt: '2026-01-31T00:00:00Z',
    };
    mocks.rollupFindUnique.mockResolvedValue(rollup);
    const svc = new OrgBillingRollupAuthService(prisma);
    const out = await svc.loadRollup({
      orgId: 'org1',
      period: '2026-01',
      currency: 'USD',
    });
    expect(out?.grossMinor).toBe(100);
  });

  it('loadRollup() returns null when missing', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.rollupFindUnique.mockResolvedValue(null);
    const svc = new OrgBillingRollupAuthService(prisma);
    expect(await svc.loadRollup({ orgId: 'org1', period: '2026-01', currency: 'USD' })).toBeNull();
  });

  it('produceAllRollups() loops org × period × currency', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.lineItemFindMany.mockResolvedValue([lineItemRow()]);
    mocks.creditFindMany.mockResolvedValue([]);
    mocks.rollupUpsert.mockResolvedValue({});
    const svc = new OrgBillingRollupAuthService(prisma);
    const out = await svc.produceAllRollups();
    expect(out.length).toBeGreaterThan(0);
    expect(mocks.rollupUpsert).toHaveBeenCalled();
  });

  it('decideDunningLevel() delegates', () => {
    const { prisma } = mkPrismaMock();
    const svc = new OrgBillingRollupAuthService(prisma);
    expect(svc.decideDunningLevel({ daysPastDue: 45 })).toBe('past-due-30');
  });
});
