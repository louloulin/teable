import { BadRequestException } from '@nestjs/common';
import { vi } from 'vitest';

import { AiCreditAuthService } from './ai-credit.auth.service';

interface IMockAiCreditLedger {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  aiCreditLedger: IMockAiCreditLedger;
}

const buildPrisma = (): IMockPrisma => ({
  aiCreditLedger: {
    create: vi.fn(async ({ data }) => data),
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
  },
});

describe('AiCreditAuthService (Stage 26)', () => {
  let prisma: IMockPrisma;
  let svc: AiCreditAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AiCreditAuthService(prisma as never);
  });

  describe('record', () => {
    it('persists a charge row with a YYYY-MM bucket', async () => {
      const out = await svc.record({
        organizationId: 'org_1',
        action: 'charge',
        credits: 250,
        provider: 'openai',
        sourceRef: 'ai_run_1',
      });
      expect(out.action).toBe('charge');
      expect(out.credits).toBe(250);
      expect(out.monthBucket).toMatch(/^\d{4}-\d{2}$/);
    });

    it('rejects an unknown action', async () => {
      await expect(
        svc.record({ organizationId: 'org_1', action: 'explode' as never, credits: 10 })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-positive credits', async () => {
      await expect(
        svc.record({ organizationId: 'org_1', action: 'charge', credits: 0 })
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.record({ organizationId: 'org_1', action: 'charge', credits: -1 })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('monthlyUsage', () => {
    it('passes through to summarizeMonth with the right bucket', async () => {
      prisma.aiCreditLedger.findMany.mockResolvedValueOnce([
        {
          id: 'a',
          organizationId: 'org_1',
          action: 'charge',
          credits: 100,
          provider: null,
          sourceRef: null,
          monthBucket: '2026-08',
          createdTime: new Date('2026-08-15T00:00:00Z'),
        },
      ]);
      const out = await svc.monthlyUsage({ organizationId: 'org_1', monthBucket: '2026-08' });
      expect(out.consumed).toBe(100);
      expect(out.chargeCount).toBe(1);
    });
  });

  describe('check', () => {
    it('blocks when the estimate would exceed the limit', async () => {
      prisma.aiCreditLedger.findMany.mockResolvedValueOnce([
        {
          id: 'a',
          organizationId: 'org_1',
          action: 'charge',
          credits: 900,
          provider: null,
          sourceRef: null,
          monthBucket: '2026-08',
          createdTime: new Date('2026-08-15T00:00:00Z'),
        },
      ]);
      const r = await svc.check({
        organizationId: 'org_1',
        estimatedCredits: 200,
        limit: 1000,
        monthBucket: '2026-08',
      });
      expect(r.allowed).toBe(false);
      expect(r.remaining).toBe(-100);
    });

    it('allows when within budget', async () => {
      prisma.aiCreditLedger.findMany.mockResolvedValueOnce([
        {
          id: 'a',
          organizationId: 'org_1',
          action: 'charge',
          credits: 100,
          provider: null,
          sourceRef: null,
          monthBucket: '2026-08',
          createdTime: new Date('2026-08-15T00:00:00Z'),
        },
      ]);
      const r = await svc.check({
        organizationId: 'org_1',
        estimatedCredits: 200,
        limit: 1000,
        monthBucket: '2026-08',
      });
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(700);
    });
  });

  describe('rollover', () => {
    it('grants the carryover once and is idempotent', async () => {
      prisma.aiCreditLedger.findMany.mockResolvedValueOnce([
        {
          id: 'prev1',
          organizationId: 'org_1',
          action: 'charge',
          credits: 600,
          provider: null,
          sourceRef: null,
          monthBucket: '2026-07',
          createdTime: new Date('2026-07-15T00:00:00Z'),
        },
      ]);
      prisma.aiCreditLedger.findFirst.mockResolvedValueOnce(null);
      const out = await svc.rollover({
        organizationId: 'org_1',
        carryCap: 200,
        limit: 1000,
        now: new Date('2026-08-01T00:00:00Z'),
      });
      expect(out.grantCredits).toBe(200);
      expect(out.previousBucket).toBe('2026-07');
      expect(out.ledgerId).toMatch(/^aic_/);
      expect(prisma.aiCreditLedger.create).toHaveBeenCalledTimes(1);
    });

    it('skips the second invocation when a carryover for the same bucket already exists', async () => {
      prisma.aiCreditLedger.findMany.mockResolvedValueOnce([
        {
          id: 'prev1',
          organizationId: 'org_1',
          action: 'charge',
          credits: 600,
          provider: null,
          sourceRef: null,
          monthBucket: '2026-07',
          createdTime: new Date('2026-07-15T00:00:00Z'),
        },
      ]);
      prisma.aiCreditLedger.findFirst.mockResolvedValueOnce({ id: 'existing' });
      const out = await svc.rollover({
        organizationId: 'org_1',
        carryCap: 200,
        limit: 1000,
        now: new Date('2026-08-01T00:00:00Z'),
      });
      expect(out.grantCredits).toBe(0);
      expect(out.ledgerId).toBe('existing');
      expect(prisma.aiCreditLedger.create).not.toHaveBeenCalled();
    });

    it('skips when the previous month overshot', async () => {
      prisma.aiCreditLedger.findMany.mockResolvedValueOnce([
        {
          id: 'prev1',
          organizationId: 'org_1',
          action: 'charge',
          credits: 1500,
          provider: null,
          sourceRef: null,
          monthBucket: '2026-07',
          createdTime: new Date('2026-07-15T00:00:00Z'),
        },
      ]);
      const out = await svc.rollover({
        organizationId: 'org_1',
        carryCap: 200,
        limit: 1000,
        now: new Date('2026-08-01T00:00:00Z'),
      });
      expect(out.grantCredits).toBe(0);
      expect(out.ledgerId).toBeNull();
      expect(prisma.aiCreditLedger.create).not.toHaveBeenCalled();
    });
  });
});
