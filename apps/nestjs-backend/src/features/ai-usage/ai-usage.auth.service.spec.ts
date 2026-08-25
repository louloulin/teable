/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException } from '@nestjs/common';
import { vi } from 'vitest';

import { AiUsageAuthService } from './ai-usage.auth.service';

interface IMockBucketTable {
  upsert: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPolicyTable {
  upsert: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  aiUsageBucket: IMockBucketTable;
  aiCreditGrantPolicy: IMockPolicyTable;
}

const buildPrisma = (): IMockPrisma => ({
  aiUsageBucket: {
    upsert: vi.fn(async ({ where, create, update }) => ({
      id: `aub_${where.organizationId_model_action_monthBucket.organizationId}_${where.organizationId_model_action_monthBucket.model}_${where.organizationId_model_action_monthBucket.action}_${where.organizationId_model_action_monthBucket.monthBucket}`,
      organizationId: where.organizationId_model_action_monthBucket.organizationId,
      model: where.organizationId_model_action_monthBucket.model,
      action: where.organizationId_model_action_monthBucket.action,
      credits: (create?.credits ?? 0) + (update?.credits?.increment ?? 0),
      eventCount: (create?.eventCount ?? 0) + (update?.eventCount?.increment ?? 0),
      monthBucket: where.organizationId_model_action_monthBucket.monthBucket,
      updatedTime: new Date(),
    })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
  },
  aiCreditGrantPolicy: {
    upsert: vi.fn(async ({ create, update, where }) => ({
      id: `pol_${where.organizationId}`,
      organizationId: where.organizationId,
      monthlyLimit: create?.monthlyLimit ?? update?.monthlyLimit,
      carryCap: create?.carryCap ?? update?.carryCap,
      perModelCapJson: create?.perModelCapJson ?? update?.perModelCapJson ?? null,
      updatedBy: create?.updatedBy ?? update?.updatedBy,
    })),
    findUnique: vi.fn(async () => null),
  },
});

describe('AiUsageAuthService (Stage 29)', () => {
  let prisma: IMockPrisma;
  let svc: AiUsageAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AiUsageAuthService(prisma as never);
  });

  describe('recordUsage', () => {
    it('normalizes model/action and persists a bucket row', async () => {
      await svc.recordUsage({
        organizationId: 'org_1',
        model: '  GPT-4O ',
        action: 'Completion',
        credits: 50,
        monthBucket: '2026-08',
      });
      expect(prisma.aiUsageBucket.upsert).toHaveBeenCalledTimes(1);
      const call = prisma.aiUsageBucket.upsert.mock.calls[0][0];
      expect(call.where.organizationId_model_action_monthBucket.model).toBe('gpt-4o');
      expect(call.where.organizationId_model_action_monthBucket.action).toBe('completion');
      expect(call.update.credits).toEqual({ increment: 50 });
      expect(call.update.eventCount).toEqual({ increment: 1 });
    });

    it('rejects non-positive credits', async () => {
      await expect(
        svc.recordUsage({ organizationId: 'org_1', model: 'm', action: 'a', credits: 0 })
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.recordUsage({ organizationId: 'org_1', model: 'm', action: 'a', credits: -5 })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects missing organizationId', async () => {
      await expect(
        svc.recordUsage({ organizationId: '', model: 'm', action: 'a', credits: 5 })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('summary', () => {
    it('groups buckets by model and action', async () => {
      prisma.aiUsageBucket.findMany.mockResolvedValueOnce([
        {
          id: 'aub_1',
          organizationId: 'org_1',
          model: 'gpt-4o-mini',
          action: 'completion',
          credits: 500,
          eventCount: 3,
          monthBucket: '2026-08',
          updatedTime: new Date(),
        },
        {
          id: 'aub_2',
          organizationId: 'org_1',
          model: 'claude-haiku-4-5',
          action: 'completion',
          credits: 300,
          eventCount: 2,
          monthBucket: '2026-08',
          updatedTime: new Date(),
        },
      ]);
      const s = await svc.summary({ organizationId: 'org_1', monthBucket: '2026-08' });
      expect(s.total).toBe(800);
      expect(s.byModel).toHaveLength(2);
      expect(s.byAction).toHaveLength(1);
    });
  });

  describe('checkModelCap', () => {
    it('allows when no cap configured', async () => {
      prisma.aiCreditGrantPolicy.findUnique.mockResolvedValueOnce(null);
      const r = await svc.checkModelCap({
        organizationId: 'org_1',
        model: 'm',
        action: 'a',
        estimatedCredits: 999_999,
      });
      expect(r.allowed).toBe(true);
      expect(r.perModelCap).toBeNull();
    });

    it('blocks when estimate would exceed cap', async () => {
      prisma.aiCreditGrantPolicy.findUnique.mockResolvedValueOnce({
        id: 'pol_1',
        organizationId: 'org_1',
        monthlyLimit: 100_000,
        carryCap: 0,
        perModelCapJson: '{"m": 1000}',
      });
      prisma.aiUsageBucket.findUnique.mockResolvedValueOnce({
        id: 'aub_x',
        organizationId: 'org_1',
        model: 'm',
        action: 'a',
        credits: 800,
        eventCount: 5,
        monthBucket: '2026-08',
        updatedTime: new Date(),
      });
      const r = await svc.checkModelCap({
        organizationId: 'org_1',
        model: 'm',
        action: 'a',
        estimatedCredits: 300,
        monthBucket: '2026-08',
      });
      expect(r.allowed).toBe(false);
      expect(r.perModelCap).toBe(1000);
      expect(r.remaining).toBe(200);
    });

    it('blocks with gpt-4o-mini cap', async () => {
      prisma.aiCreditGrantPolicy.findUnique.mockResolvedValueOnce({
        id: 'pol_2',
        organizationId: 'org_1',
        monthlyLimit: 100_000,
        carryCap: 0,
        perModelCapJson: '{"gpt-4o-mini": 1000}',
      });
      prisma.aiUsageBucket.findUnique.mockResolvedValueOnce({
        id: 'aub_y',
        organizationId: 'org_1',
        model: 'gpt-4o-mini',
        action: 'completion',
        credits: 800,
        eventCount: 5,
        monthBucket: '2026-08',
        updatedTime: new Date(),
      });
      const r = await svc.checkModelCap({
        organizationId: 'org_1',
        model: 'gpt-4o-mini',
        action: 'completion',
        estimatedCredits: 300,
        monthBucket: '2026-08',
      });
      expect(r.allowed).toBe(false);
      expect(r.perModelCap).toBe(1000);
    });
  });

  describe('setPolicy / getPolicy', () => {
    it('writes a policy row', async () => {
      const out = await svc.setPolicy({
        organizationId: 'org_1',
        monthlyLimit: 50_000,
        carryCap: 5_000,
        perModelCap: { 'gpt-4o-mini': 1000 },
        updatedBy: 'admin_1',
      });
      expect(out.monthlyLimit).toBe(50_000);
      expect(out.carryCap).toBe(5_000);
      expect(out.perModelCap).toEqual({ 'gpt-4o-mini': 1000 });
    });

    it('rejects negative numbers', async () => {
      await expect(
        svc.setPolicy({ organizationId: 'org_1', monthlyLimit: -1, updatedBy: 'admin_1' })
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        svc.setPolicy({
          organizationId: 'org_1',
          monthlyLimit: 0,
          carryCap: -1,
          updatedBy: 'admin_1',
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
