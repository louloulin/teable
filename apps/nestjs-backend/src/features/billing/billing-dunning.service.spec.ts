/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { BillingDunningService } from './billing-dunning.service';

interface IMockDunningPlanTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
}
interface IMockDunningStepTable {
  create: ReturnType<typeof vi.fn>;
  createMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  $transaction: ReturnType<typeof vi.fn>;
  billingDunningPlan: IMockDunningPlanTable;
  billingDunningStep: IMockDunningStepTable;
}

const buildPrisma = (): IMockPrisma => {
  const prisma = {
    $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => {
      const out: unknown[] = [];
      for (const op of ops) out.push(await op);
      return out;
    }),
    billingDunningPlan: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
    },
    billingDunningStep: {
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(async ({ where, data }) => ({
        id: where.id ?? data.id,
        planId: where.planId ?? data.planId,
        kind: data.kind ?? 'T1_DUNNING_EMAIL',
        status: data.status ?? 'scheduled',
        dueAt: data.dueAt ?? new Date(),
        executedAt: data.executedAt ?? null,
        canceledAt: data.canceledAt ?? null,
        result: data.result ?? null,
        createdTime: new Date(),
        updatedTime: new Date(),
        ...data,
      })),
      updateMany: vi.fn(async () => ({ count: 0 })),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
    },
  };
  return prisma;
};

const planFixture = (overrides: Partial<{
  subscriptionId: string;
  status: 'active' | 'recovered' | 'completed';
  reason: string | null;
}> = {}) => ({
  id: 'dunp_test',
  subscriptionId: overrides.subscriptionId ?? 'sub_test',
  status: overrides.status ?? 'active',
  reason: overrides.reason ?? null,
  openedAt: new Date('2026-01-01T00:00:00.000Z'),
  resolvedAt: null,
  createdTime: new Date('2026-01-01T00:00:00.000Z'),
  updatedTime: new Date('2026-01-01T00:00:00.000Z'),
  steps: [],
});

const stepFixture = (overrides: Partial<{
  id: string;
  planId: string;
  kind: 'T1_DUNNING_EMAIL' | 'T2_DUNNING_RETRY' | 'T3_FINAL_NOTICE' | 'T14_CANCEL';
  status: 'scheduled' | 'executed' | 'canceled';
  dueAt: Date;
}> = {}) => ({
  id: overrides.id ?? 'duns_test',
  planId: overrides.planId ?? 'dunp_test',
  kind: overrides.kind ?? 'T1_DUNNING_EMAIL',
  status: overrides.status ?? 'scheduled',
  dueAt: overrides.dueAt ?? new Date('2026-01-02T00:00:00.000Z'),
  executedAt: null,
  canceledAt: null,
  result: null,
  createdTime: new Date('2026-01-01T00:00:00.000Z'),
  updatedTime: new Date('2026-01-01T00:00:00.000Z'),
});

describe('BillingDunningService (Phase 5.3 part 1)', () => {
  let prisma: IMockPrisma;
  let service: BillingDunningService;

  beforeEach(() => {
    prisma = buildPrisma();
    // Default: plan.create echoes the request and stores `steps` for the
    // follow-up findUnique.
    let lastInsert: { planId: string } | null = null;
    prisma.billingDunningPlan.create.mockImplementation(async ({ data }) => {
      lastInsert = { planId: data.id };
      return { id: data.id, ...data, openedAt: new Date(), resolvedAt: null, steps: data.steps?.create ?? [] };
    });
    prisma.billingDunningPlan.findUnique.mockImplementation(async ({ where }) => {
      if (!lastInsert || where.id !== lastInsert.planId) return null;
      const steps = (prisma.billingDunningStep.update as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
      void steps; // Silence unused warning
      return planFixture({ subscriptionId: 'sub_test' });
    });
    service = new BillingDunningService(prisma as unknown as never);
  });

  describe('scheduleRecoverySteps', () => {
    it('opens a plan with four steps at the documented offsets', async () => {
      const asOf = new Date('2026-01-01T00:00:00.000Z');
      const plan = await service.scheduleRecoverySteps({
        subscriptionId: 'sub_test',
        reason: 'payment_failed',
        asOf,
      });

      expect(plan.status).toBe('active');
      expect(plan.subscriptionId).toBe('sub_test');
      const createArg = prisma.billingDunningPlan.create.mock.calls[0][0];
      expect(createArg.data.reason).toBe('payment_failed');
      expect(createArg.data.steps.create).toHaveLength(4);
      const kinds = createArg.data.steps.create.map((s: { kind: string }) => s.kind);
      expect(kinds).toEqual([
        'T1_DUNNING_EMAIL',
        'T2_DUNNING_RETRY',
        'T3_FINAL_NOTICE',
        'T14_CANCEL',
      ]);
      const dueOffsets = createArg.data.steps.create.map(
        (s: { dueAt: Date }) => s.dueAt.getTime() - asOf.getTime()
      );
      expect(dueOffsets).toEqual([
        24 * 60 * 60 * 1000,
        72 * 60 * 60 * 1000,
        7 * 24 * 60 * 60 * 1000,
        14 * 24 * 60 * 60 * 1000,
      ]);
    });

    it('is idempotent while a plan is still active', async () => {
      prisma.billingDunningPlan.findFirst.mockResolvedValueOnce(
        planFixture({ subscriptionId: 'sub_test', status: 'active' })
      );

      const plan = await service.scheduleRecoverySteps({ subscriptionId: 'sub_test' });

      expect(plan.id).toBe('dunp_test');
      expect(prisma.billingDunningPlan.create).not.toHaveBeenCalled();
    });

    it('reopens a plan after the previous one recovered', async () => {
      prisma.billingDunningPlan.findFirst.mockResolvedValueOnce(null);

      const plan = await service.scheduleRecoverySteps({ subscriptionId: 'sub_test' });

      expect(plan.status).toBe('active');
      expect(prisma.billingDunningPlan.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelOnRecovery', () => {
    it('cancels every scheduled step and flips the plan to recovered', async () => {
      const asOf = new Date('2026-01-15T00:00:00.000Z');
      prisma.billingDunningPlan.findFirst.mockResolvedValueOnce(planFixture());
      prisma.billingDunningPlan.findUnique.mockResolvedValueOnce({
        ...planFixture({ status: 'recovered' }),
        resolvedAt: asOf,
      });

      const plan = await service.cancelOnRecovery({ subscriptionId: 'sub_test', asOf });

      expect(plan?.status).toBe('recovered');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.billingDunningStep.updateMany).toHaveBeenCalledWith({
        where: { planId: 'dunp_test', status: 'scheduled' },
        data: { status: 'canceled', canceledAt: asOf },
      });
      expect(prisma.billingDunningPlan.update).toHaveBeenCalledWith({
        where: { id: 'dunp_test' },
        data: { status: 'recovered', resolvedAt: asOf },
      });
    });

    it('returns null when no active plan exists', async () => {
      prisma.billingDunningPlan.findFirst.mockResolvedValueOnce(null);

      const plan = await service.cancelOnRecovery({ subscriptionId: 'sub_test' });

      expect(plan).toBeNull();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('cancelOnHardCancel', () => {
    it('cancels every scheduled step and flips the plan to completed', async () => {
      const asOf = new Date('2026-01-15T00:00:00.000Z');
      prisma.billingDunningPlan.findFirst.mockResolvedValueOnce(planFixture());
      prisma.billingDunningPlan.findUnique.mockResolvedValueOnce({
        ...planFixture({ status: 'completed' }),
        resolvedAt: asOf,
      });

      const plan = await service.cancelOnHardCancel({ subscriptionId: 'sub_test', asOf });

      expect(plan?.status).toBe('completed');
      expect(prisma.billingDunningStep.updateMany).toHaveBeenCalledWith({
        where: { planId: 'dunp_test', status: 'scheduled' },
        data: { status: 'canceled', canceledAt: asOf },
      });
      expect(prisma.billingDunningPlan.update).toHaveBeenCalledWith({
        where: { id: 'dunp_test' },
        data: { status: 'completed', resolvedAt: asOf },
      });
    });

    it('is a no-op when no active plan exists', async () => {
      prisma.billingDunningPlan.findFirst.mockResolvedValueOnce(null);

      const plan = await service.cancelOnHardCancel({ subscriptionId: 'sub_test' });

      expect(plan).toBeNull();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('markStepExecuted', () => {
    it('flips a scheduled step to executed and records the worker result', async () => {
      prisma.billingDunningStep.findUnique.mockResolvedValueOnce(stepFixture());
      prisma.billingDunningStep.update.mockResolvedValueOnce({
        ...stepFixture({ status: 'executed' }),
        executedAt: new Date('2026-01-02T00:00:00.000Z'),
        result: { sent: true, recipients: 3 },
      });

      const result = await service.markStepExecuted({
        stepId: 'duns_test',
        result: { sent: true, recipients: 3 },
      });

      expect(result?.status).toBe('executed');
      expect(result?.result).toEqual({ sent: true, recipients: 3 });
      expect(prisma.billingDunningStep.update).toHaveBeenCalledWith({
        where: { id: 'duns_test' },
        data: expect.objectContaining({
          status: 'executed',
          result: { sent: true, recipients: 3 },
        }),
      });
    });

    it('is a no-op when the step is already non-scheduled', async () => {
      prisma.billingDunningStep.findUnique.mockResolvedValueOnce(
        stepFixture({ status: 'canceled' })
      );

      const result = await service.markStepExecuted({ stepId: 'duns_test' });

      expect(result?.status).toBe('canceled');
      expect(prisma.billingDunningStep.update).not.toHaveBeenCalled();
    });

    it('returns null when the step does not exist', async () => {
      prisma.billingDunningStep.findUnique.mockResolvedValueOnce(null);

      const result = await service.markStepExecuted({ stepId: 'dun_missing' });

      expect(result).toBeNull();
    });
  });

  describe('markStepCanceled', () => {
    it('flips a scheduled step to canceled', async () => {
      prisma.billingDunningStep.findUnique.mockResolvedValueOnce(stepFixture());
      prisma.billingDunningStep.update.mockResolvedValueOnce(
        stepFixture({ status: 'canceled' })
      );

      const result = await service.markStepCanceled({ stepId: 'duns_test' });

      expect(result?.status).toBe('canceled');
    });
  });

  describe('findDueSteps', () => {
    it('returns only scheduled steps whose dueAt has elapsed', async () => {
      prisma.billingDunningStep.findMany.mockResolvedValueOnce([
        stepFixture({ id: 'duns_a', status: 'scheduled' }),
        stepFixture({ id: 'duns_b', status: 'scheduled' }),
      ]);

      const asOf = new Date('2026-01-02T00:00:00.000Z');
      const steps = await service.findDueSteps({ asOf, limit: 100 });

      expect(steps).toHaveLength(2);
      expect(prisma.billingDunningStep.findMany).toHaveBeenCalledWith({
        where: { status: 'scheduled', dueAt: { lte: asOf } },
        orderBy: { dueAt: 'asc' },
        take: 100,
      });
    });

    it('clamps the limit to 500', async () => {
      prisma.billingDunningStep.findMany.mockResolvedValueOnce([]);

      await service.findDueSteps({ limit: 99999 });

      expect(prisma.billingDunningStep.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 })
      );
    });
  });

  describe('getPlan', () => {
    it('returns the most-recent plan for a subscription', async () => {
      prisma.billingDunningPlan.findFirst.mockResolvedValueOnce(planFixture());

      const plan = await service.getPlan('sub_test');

      expect(plan?.subscriptionId).toBe('sub_test');
      expect(prisma.billingDunningPlan.findFirst).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub_test' },
        orderBy: { createdTime: 'desc' },
        include: { steps: true },
      });
    });

    it('returns null when no plan exists', async () => {
      prisma.billingDunningPlan.findFirst.mockResolvedValueOnce(null);

      const plan = await service.getPlan('sub_test');

      expect(plan).toBeNull();
    });
  });
});
