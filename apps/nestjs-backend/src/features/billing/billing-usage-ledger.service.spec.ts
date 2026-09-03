/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { BillingUsageLedgerService } from './billing-usage-ledger.service';

interface IMockLedgerTable {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  billingUsageEvent: IMockLedgerTable;
}

const buildPrisma = (): IMockPrisma => ({
  billingUsageEvent: {
    create: vi.fn(async ({ data }) => ({
      id: data.id,
      organizationId: data.organizationId,
      metric: data.metric,
      quantity: data.quantity,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      source: data.source,
      idempotencyKey: data.idempotencyKey ?? null,
      metadata: data.metadata ?? null,
      recordedAt: data.recordedAt ?? new Date('2026-01-01T00:00:00.000Z'),
    })),
    findUnique: vi.fn(async () => null),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    update: vi.fn(async ({ where, data }) => ({
      id: where.id,
      organizationId: 'org_test',
      metric: 'ai_credits',
      quantity: data.quantity,
      periodStart: new Date('2026-01-01T00:00:00.000Z'),
      periodEnd: new Date('2026-02-01T00:00:00.000Z'),
      source: 'ai-chat',
      idempotencyKey: null,
      metadata: data.metadata ?? null,
      recordedAt: new Date('2026-01-01T00:00:00.000Z'),
    })),
  },
});

const periodStart = new Date('2026-09-01T00:00:00.000Z');
const periodEnd = new Date('2026-10-01T00:00:00.000Z');

describe('BillingUsageLedgerService (Phase 5.5 part 1)', () => {
  let prisma: IMockPrisma;
  let svc: BillingUsageLedgerService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new BillingUsageLedgerService(prisma as never);
  });

  describe('recordUsage', () => {
    it('writes a new event with the supplied quantity', async () => {
      const out = await svc.recordUsage({
        organizationId: 'org_a',
        metric: 'ai_credits',
        quantity: 1234,
        periodStart,
        periodEnd,
        source: 'ai-chat',
      });
      expect(out.metric).toBe('ai_credits');
      expect(out.quantity).toBe(1234n);
      expect(prisma.billingUsageEvent.create).toHaveBeenCalledTimes(1);
    });

    it('returns a no-op sentinel for zero quantity without writing', async () => {
      const out = await svc.recordUsage({
        organizationId: 'org_a',
        metric: 'ai_credits',
        quantity: 0,
        periodStart,
        periodEnd,
        source: 'ai-chat',
      });
      expect(out.id).toBe('noop');
      expect(out.quantity).toBe(0n);
      expect(prisma.billingUsageEvent.create).not.toHaveBeenCalled();
    });

    it('returns the existing row when an idempotencyKey already recorded', async () => {
      prisma.billingUsageEvent.findFirst.mockResolvedValueOnce({
        id: 'usgev_existing',
        organizationId: 'org_a',
        metric: 'ai_credits',
        quantity: 100n,
        periodStart,
        periodEnd,
        source: 'ai-chat',
        idempotencyKey: 'req-1',
        metadata: null,
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const out = await svc.recordUsage({
        organizationId: 'org_a',
        metric: 'ai_credits',
        quantity: 100,
        periodStart,
        periodEnd,
        source: 'ai-chat',
        idempotencyKey: 'req-1',
      });
      expect(out.id).toBe('usgev_existing');
      expect(prisma.billingUsageEvent.create).not.toHaveBeenCalled();
    });

    it('rejects negative quantity', async () => {
      await expect(
        svc.recordUsage({
          organizationId: 'org_a',
          metric: 'ai_credits',
          quantity: -1,
          periodStart,
          periodEnd,
          source: 'ai-chat',
        })
      ).rejects.toThrow(/non-negative/);
    });

    it('rejects periodEnd <= periodStart', async () => {
      await expect(
        svc.recordUsage({
          organizationId: 'org_a',
          metric: 'ai_credits',
          quantity: 1,
          periodStart,
          periodEnd: periodStart,
          source: 'ai-chat',
        })
      ).rejects.toThrow(/periodEnd must be strictly after periodStart/);
    });

    it('accepts BigInt quantity directly', async () => {
      const out = await svc.recordUsage({
        organizationId: 'org_a',
        metric: 'storage_bytes',
        quantity: 9_876_543_210n,
        periodStart,
        periodEnd,
        source: 'attachments',
      });
      expect(out.quantity).toBe(9_876_543_210n);
    });

    it('persists metadata when supplied', async () => {
      await svc.recordUsage({
        organizationId: 'org_a',
        metric: 'ai_credits',
        quantity: 10,
        periodStart,
        periodEnd,
        source: 'ai-chat',
        metadata: { model: 'gpt-4o', tokens: 1234 },
      });
      const arg = prisma.billingUsageEvent.create.mock.calls[0]?.[0];
      expect(arg.data.metadata).toEqual({ model: 'gpt-4o', tokens: 1234 });
    });
  });

  describe('aggregate', () => {
    it('sums quantities across events in the period', async () => {
      prisma.billingUsageEvent.findMany.mockResolvedValueOnce([
        { quantity: 100n, metric: 'ai_credits' },
        { quantity: 250n, metric: 'ai_credits' },
        { quantity: 5n, metric: 'ai_credits' },
      ]);
      const out = await svc.aggregate({
        organizationId: 'org_a',
        periodStart,
        periodEnd,
        metric: 'ai_credits',
      });
      expect(out.totalQuantity).toBe(355n);
      expect(out.eventCount).toBe(3);
      expect(prisma.billingUsageEvent.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org_a',
          periodStart: { gte: periodStart },
          periodEnd: { lte: periodEnd },
          metric: 'ai_credits',
        },
        select: { quantity: true, metric: true },
      });
    });

    it('returns 0 total when no events match', async () => {
      const out = await svc.aggregate({
        organizationId: 'org_a',
        periodStart,
        periodEnd,
      });
      expect(out.totalQuantity).toBe(0n);
      expect(out.eventCount).toBe(0);
      expect(out.metric).toBe('all');
    });

    it('omits the metric filter when not provided', async () => {
      await svc.aggregate({ organizationId: 'org_a', periodStart, periodEnd });
      const where = prisma.billingUsageEvent.findMany.mock.calls[0]?.[0].where;
      expect(where.metric).toBeUndefined();
    });
  });

  describe('previewOverage', () => {
    it('returns zero overage when total <= included', async () => {
      prisma.billingUsageEvent.findMany.mockResolvedValueOnce([
        { quantity: 50n, metric: 'automation_runs' },
      ]);
      const out = await svc.previewOverage({
        organizationId: 'org_a',
        periodStart,
        periodEnd,
        metric: 'automation_runs',
        includedQuantity: 100,
        tiers: [{ threshold: 1000, unitCents: 5 }],
      });
      expect(out.overageQuantity).toBe(0n);
      expect(out.overageCents).toBe(0);
      expect(out.currency).toBe('usd');
    });

    it('charges overage across the tier table', async () => {
      // total = 5500, included = 1000 → overage = 4500
      // tier 0 covers 1001–5000 (4000 units × 1¢) → 4000¢
      // tier 1 covers 5001–10000 (500 units × 0.5¢) → 250¢
      // total: 4250¢
      prisma.billingUsageEvent.findMany.mockResolvedValueOnce([
        { quantity: 5500n, metric: 'ai_credits' },
      ]);
      const out = await svc.previewOverage({
        organizationId: 'org_a',
        periodStart,
        periodEnd,
        metric: 'ai_credits',
        includedQuantity: 1000,
        tiers: [
          { threshold: 5000, unitCents: 1 },
          { threshold: 10000, unitCents: 0.5 },
        ],
      });
      expect(out.overageQuantity).toBe(4500n);
      expect(out.overageCents).toBe(4250);
      expect(out.tierBreakdown).toHaveLength(2);
      expect(out.tierBreakdown[0]).toMatchObject({
        fromInclusive: 1001n,
        toInclusive: 5000n,
        unitCents: 1,
        units: 4000n,
        cents: 4000,
      });
      expect(out.tierBreakdown[1]).toMatchObject({
        fromInclusive: 5001n,
        toInclusive: 10000n,
        unitCents: 0.5,
        units: 500n,
        cents: 250,
      });
    });

    it('handles fractional unit cents by rounding', async () => {
      prisma.billingUsageEvent.findMany.mockResolvedValueOnce([
        { quantity: 1003n, metric: 'records' },
      ]);
      const out = await svc.previewOverage({
        organizationId: 'org_a',
        periodStart,
        periodEnd,
        metric: 'records',
        includedQuantity: 1000,
        tiers: [{ threshold: 100_000, unitCents: 0.5 }],
      });
      // 3 units × 0.5¢ = 1.5¢ → round to 2
      expect(out.overageCents).toBe(2);
    });

    it('respects a tail-tier with a high threshold', async () => {
      prisma.billingUsageEvent.findMany.mockResolvedValueOnce([
        { quantity: 12_345n, metric: 'storage_bytes' },
      ]);
      const out = await svc.previewOverage({
        organizationId: 'org_a',
        periodStart,
        periodEnd,
        metric: 'storage_bytes',
        includedQuantity: 5000,
        tiers: [
          { threshold: 10_000, unitCents: 0.1 },
          { threshold: Number.MAX_SAFE_INTEGER, unitCents: 0.05 },
        ],
      });
      // overage = 7345; tier 0 (5001–10000) = 5000 units × 0.1 = 500
      // tier 1 (10001–MAX) = 2345 units × 0.05 = 117.25 → 117
      // total: 617
      expect(out.overageQuantity).toBe(7345n);
      expect(out.overageCents).toBe(500 + 117);
    });

    it('accepts a custom currency', async () => {
      const out = await svc.previewOverage({
        organizationId: 'org_a',
        periodStart,
        periodEnd,
        metric: 'email_sends',
        includedQuantity: 0,
        tiers: [{ threshold: 100, unitCents: 1 }],
        currency: 'eur',
      });
      expect(out.currency).toBe('eur');
    });
  });

  describe('calibrate', () => {
    it('updates an existing event row', async () => {
      prisma.billingUsageEvent.findUnique.mockResolvedValueOnce({
        id: 'usgev_x',
        organizationId: 'org_a',
        metric: 'ai_credits',
        quantity: 100n,
        periodStart,
        periodEnd,
        source: 'ai-chat',
        idempotencyKey: null,
        metadata: null,
        recordedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const out = await svc.calibrate({
        eventId: 'usgev_x',
        quantity: 50,
        metadata: { reason: 'replay-of-overcount', actor: 'admin' },
      });
      expect(out?.quantity).toBe(50n);
      expect(prisma.billingUsageEvent.update).toHaveBeenCalledWith({
        where: { id: 'usgev_x' },
        data: expect.objectContaining({
          quantity: 50n,
          metadata: { reason: 'replay-of-overcount', actor: 'admin' },
        }),
      });
    });

    it('returns null when the event does not exist', async () => {
      const out = await svc.calibrate({ eventId: 'usgev_missing', quantity: 1 });
      expect(out).toBeNull();
      expect(prisma.billingUsageEvent.update).not.toHaveBeenCalled();
    });

    it('rejects negative calibration quantity', async () => {
      await expect(svc.calibrate({ eventId: 'usgev_x', quantity: -5 })).rejects.toThrow(
        /non-negative/
      );
    });
  });
});
