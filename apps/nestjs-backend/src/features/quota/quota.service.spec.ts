import type { TestingModule } from '@nestjs/testing';
import { vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { PrismaService, PlanLevel, QuotaMetric } from '@teable/db-main-prisma';

import { GB, PLAN_LIMITS } from './quota.constants';
import { QuotaExceededException } from './quota.exception';
import { QuotaService } from './quota.service';

interface IFakeCounter {
  id: number;
  spaceId: string;
  metric: QuotaMetric;
  periodStart: Date;
  periodKind: string;
  used: bigint;
  capSnapshot: bigint | null;
  lastEventAt: Date;
}

class FakePrisma {
  spaceQuota = {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  };
  spaceUsageCounter = {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  };
  quotaHit = {
    findMany: vi.fn(),
    create: vi.fn(),
  };
  $transaction = vi.fn();
}

describe('QuotaService', () => {
  let service: QuotaService;
  let prisma: FakePrisma;
  const spaceId = 'sp_test';

  beforeEach(async () => {
    prisma = new FakePrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: PrismaService, useValue: prisma as unknown as PrismaService },
      ],
    }).compile();
    service = module.get(QuotaService);
  });

  describe('ensureForSpace', () => {
    it('is a no-op when row already exists', async () => {
      prisma.spaceQuota.upsert.mockResolvedValue({});
      await service.ensureForSpace(spaceId, 'self_hosted');
      expect(prisma.spaceQuota.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { spaceId },
          create: expect.objectContaining({ spaceId, plan: 'self_hosted' }),
          update: {},
        })
      );
    });
  });

  describe('check', () => {
    it('allows unlimited plans without consulting counters', async () => {
      prisma.spaceQuota.findUnique.mockResolvedValue({
        spaceId,
        plan: 'self_hosted',
      });
      const result = await service.check(spaceId, QuotaMetric.rows, 1_000_000n);
      expect(result.allowed).toBe(true);
      expect(result.cap).toBeNull();
    });

    it('returns allowed=false with reason when over the cap', async () => {
      prisma.spaceQuota.findUnique.mockResolvedValue({
        spaceId,
        plan: 'free',
        rowLimit: 1000,
      });
      prisma.spaceUsageCounter.findUnique.mockResolvedValue({
        used: 1000n,
      });
      const result = await service.check(spaceId, QuotaMetric.rows, 1n);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/monthly rows quota exhausted/);
    });
  });

  describe('consume', () => {
    it('skips enforcement for self-host plans', async () => {
      prisma.spaceQuota.findUnique.mockResolvedValue({
        spaceId,
        plan: 'self_hosted',
      });
      await service.consume(spaceId, QuotaMetric.rows, 1_000_000n);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws QuotaExceededException when the upserted counter overflows', async () => {
      prisma.spaceQuota.findUnique.mockResolvedValue({
        spaceId,
        plan: 'free',
        rowLimit: 1000,
      });
      const counter: IFakeCounter = {
        id: 1,
        spaceId,
        metric: QuotaMetric.rows,
        periodStart: new Date(),
        periodKind: 'monthly',
        used: 1500n,
        capSnapshot: 1000n,
        lastEventAt: new Date(),
      };
      prisma.spaceUsageCounter.upsert.mockResolvedValue(counter);
      prisma.spaceUsageCounter.update.mockResolvedValue({ ...counter, used: 500n });
      prisma.quotaHit.create.mockResolvedValue({});

      prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        await cb(prisma);
      });

      await expect(service.consume(spaceId, QuotaMetric.rows, 1000n)).rejects.toBeInstanceOf(
        QuotaExceededException
      );
      expect(prisma.quotaHit.create).toHaveBeenCalled();
    });

    it('persists the consume on the happy path', async () => {
      prisma.spaceQuota.findUnique.mockResolvedValue({
        spaceId,
        plan: 'free',
        rowLimit: 1000,
      });
      const counter: IFakeCounter = {
        id: 1,
        spaceId,
        metric: QuotaMetric.rows,
        periodStart: new Date(),
        periodKind: 'monthly',
        used: 10n,
        capSnapshot: 1000n,
        lastEventAt: new Date(),
      };
      prisma.spaceUsageCounter.upsert.mockResolvedValue(counter);
      prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        await cb(prisma);
      });
      await service.consume(spaceId, QuotaMetric.rows, 5n);
      expect(prisma.quotaHit.create).not.toHaveBeenCalled();
    });
  });

  describe('PLAN_LIMITS', () => {
    it('matches the Teable.ai Cloud pricing page', () => {
      // Free: 1000 rows, 1GB attachments, 100 automation runs, 200 AI credits
      const free = PLAN_LIMITS.free;
      expect(free.rowLimit).toBe(1_000);
      expect(free.attachmentByteLimit).toBe(1n * GB);
      expect(free.automationRunLimit).toBe(100);
      expect(free.aiCreditLimit).toBe(200);
    });

    it('keeps self-host / enterprise unlimited', () => {
      for (const plan of ['self_hosted', 'enterprise'] as PlanLevel[]) {
        for (const v of Object.values(PLAN_LIMITS[plan])) {
          expect(v).toBeNull();
        }
      }
    });
  });
});
