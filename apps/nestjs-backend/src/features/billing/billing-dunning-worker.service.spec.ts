/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { BillingDunningWorkerService } from './billing-dunning-worker.service';
import type {
  DunningStepKind,
  IDunningStep,
} from './billing-dunning.service';

interface IMockDunningSvc {
  findDueSteps: ReturnType<typeof vi.fn>;
  markStepExecuted: ReturnType<typeof vi.fn>;
  recordStepResult: ReturnType<typeof vi.fn>;
}

interface IMockAuthSvc {
  cancelSubscription: ReturnType<typeof vi.fn>;
}

interface IMockPrisma {
  billingDunningPlan: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  subscription: {
    findUnique: ReturnType<typeof vi.fn>;
  };
}

const buildStep = (overrides: Partial<IDunningStep> = {}): IDunningStep => ({
  id: overrides.id ?? 'duns_test',
  planId: overrides.planId ?? 'dunp_test',
  kind: overrides.kind ?? 'T1_DUNNING_EMAIL',
  status: overrides.status ?? 'scheduled',
  dueAt: overrides.dueAt ?? new Date('2026-01-02T00:00:00.000Z'),
  executedAt: overrides.executedAt ?? null,
  canceledAt: overrides.canceledAt ?? null,
  result: overrides.result ?? null,
  createdTime: overrides.createdTime ?? new Date('2026-01-01T00:00:00.000Z'),
  updatedTime: overrides.updatedTime ?? new Date('2026-01-01T00:00:00.000Z'),
});

const buildPlan = (overrides: Partial<{ subscriptionId: string; status: 'active' | 'recovered' | 'completed' }> = {}) => ({
  id: 'dunp_test',
  subscriptionId: overrides.subscriptionId ?? 'org_test',
  status: overrides.status ?? 'active',
  reason: null,
  openedAt: new Date('2026-01-01T00:00:00.000Z'),
  resolvedAt: null,
  createdTime: new Date('2026-01-01T00:00:00.000Z'),
  updatedTime: new Date('2026-01-01T00:00:00.000Z'),
  steps: [],
});

describe('BillingDunningWorkerService (Phase 5.3 part 2)', () => {
  let prisma: IMockPrisma;
  let dunning: IMockDunningSvc;
  let auth: IMockAuthSvc;
  let worker: BillingDunningWorkerService;

  beforeEach(() => {
    prisma = {
      billingDunningPlan: {
        findUnique: vi.fn(async () => buildPlan()),
      },
      subscription: {
        findUnique: vi.fn(async () => ({
          id: 'sub_test',
          organizationId: 'org_test',
        })),
      },
    };
    dunning = {
      findDueSteps: vi.fn(async () => []),
      markStepExecuted: vi.fn(async ({ stepId }: { stepId: string }) =>
        buildStep({ id: stepId, status: 'executed' })
      ),
      recordStepResult: vi.fn(async ({ stepId }: { stepId: string; result: unknown }) =>
        buildStep({ id: stepId, result: (stepId.length > 0 ? { ok: true } : null) as unknown })
      ),
    };
    auth = {
      cancelSubscription: vi.fn(async (organizationId: string) => ({
        id: 'sub_test',
        organizationId,
        status: 'canceled' as const,
      })),
    };
    worker = new BillingDunningWorkerService(
      prisma as never,
      dunning as never,
      auth as never
    );
  });

  describe('processDueSteps', () => {
    it('returns zeros when there are no due steps', async () => {
      const result = await worker.processDueSteps();
      expect(result).toEqual({
        scanned: 0,
        executed: 0,
        skipped: 0,
        errors: 0,
        errorDetails: [],
      });
      expect(dunning.recordStepResult).not.toHaveBeenCalled();
      expect(dunning.markStepExecuted).not.toHaveBeenCalled();
    });

    it('executes T1/T2/T3 stubs and records results', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t1', kind: 'T1_DUNNING_EMAIL' }),
        buildStep({ id: 'duns_t2', kind: 'T2_DUNNING_RETRY' }),
        buildStep({ id: 'duns_t3', kind: 'T3_FINAL_NOTICE' }),
      ]);

      const result = await worker.processDueSteps({ asOf: new Date('2026-01-15T00:00:00Z') });

      expect(result.scanned).toBe(3);
      expect(result.executed).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.errors).toBe(0);
      expect(dunning.recordStepResult).toHaveBeenCalledTimes(3);
      expect(dunning.markStepExecuted).toHaveBeenCalledTimes(3);

      const t1Result = dunning.recordStepResult.mock.calls[0][0].result;
      expect(t1Result).toMatchObject({
        action: 'email_queued',
        template: 'billing-dunning-reminder',
        stub: true,
      });
      const t2Result = dunning.recordStepResult.mock.calls[1][0].result;
      expect(t2Result).toMatchObject({
        action: 'stripe_retry_triggered',
        planId: 'dunp_test',
        stub: true,
      });
    });

    it('executes T14_CANCEL by calling BillingAuthService.cancelSubscription', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t14', kind: 'T14_CANCEL' }),
      ]);
      prisma.billingDunningPlan.findUnique.mockResolvedValueOnce(
        buildPlan({ subscriptionId: 'org_xyz' })
      );
      prisma.subscription.findUnique.mockResolvedValueOnce({
        id: 'sub_xyz',
        organizationId: 'org_xyz',
      });

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(1);
      expect(auth.cancelSubscription).toHaveBeenCalledTimes(1);
      expect(auth.cancelSubscription).toHaveBeenCalledWith('org_xyz', false);

      const recorded = dunning.recordStepResult.mock.calls[0][0].result;
      expect(recorded).toMatchObject({
        action: 'subscription_canceled',
        subscriptionId: 'sub_xyz',
        organizationId: 'org_xyz',
      });
      expect(dunning.markStepExecuted).toHaveBeenCalledWith({ stepId: 'duns_t14' });
    });

    it('does not call cancelSubscription if the plan vanished', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t14', kind: 'T14_CANCEL' }),
      ]);
      prisma.billingDunningPlan.findUnique.mockResolvedValueOnce(null);

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.errorDetails[0]).toMatchObject({
        stepId: 'duns_t14',
        kind: 'T14_CANCEL',
        error: expect.stringContaining('vanished'),
      });
      expect(auth.cancelSubscription).not.toHaveBeenCalled();
      expect(dunning.recordStepResult).not.toHaveBeenCalled();
      expect(dunning.markStepExecuted).not.toHaveBeenCalled();
    });

    it('does not call cancelSubscription if the subscription vanished', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_t14', kind: 'T14_CANCEL' }),
      ]);
      prisma.subscription.findUnique.mockResolvedValueOnce(null);

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(0);
      expect(result.errors).toBe(1);
      expect(auth.cancelSubscription).not.toHaveBeenCalled();
    });

    it('counts a step as skipped when no handler is registered for its kind', async () => {
      // Cast to bypass the exhaustive Record<…, …> typing for this edge case.
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_unknown', kind: 'UNKNOWN_KIND' as DunningStepKind }),
      ]);

      const result = await worker.processDueSteps();

      expect(result.scanned).toBe(1);
      expect(result.executed).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toBe(0);
      expect(dunning.recordStepResult).not.toHaveBeenCalled();
    });

    it('leaves the step scheduled when the handler throws', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_fail', kind: 'T1_DUNNING_EMAIL' }),
      ]);
      // Force a handler error by making the dunning service throw on recordStepResult.
      dunning.recordStepResult.mockRejectedValueOnce(new Error('boom'));

      const result = await worker.processDueSteps();

      expect(result.executed).toBe(0);
      expect(result.errors).toBe(1);
      expect(result.errorDetails[0]).toMatchObject({
        stepId: 'duns_fail',
        kind: 'T1_DUNNING_EMAIL',
        error: 'boom',
      });
      // markStepExecuted was never called because recordStepResult threw first.
      expect(dunning.markStepExecuted).not.toHaveBeenCalled();
    });

    it('processes a mixed batch and reports per-step outcomes', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([
        buildStep({ id: 'duns_a', kind: 'T1_DUNNING_EMAIL' }),
        buildStep({ id: 'duns_b', kind: 'T14_CANCEL' }),
        buildStep({ id: 'duns_c', kind: 'T3_FINAL_NOTICE' }),
      ]);
      // Make the T3 step's handler throw by failing recordStepResult only
      // for its call.
      dunning.recordStepResult
        .mockResolvedValueOnce(buildStep({ id: 'duns_a' }))
        .mockResolvedValueOnce(buildStep({ id: 'duns_b' }))
        .mockRejectedValueOnce(new Error('mailer down'));

      const result = await worker.processDueSteps();

      expect(result.scanned).toBe(3);
      expect(result.executed).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.errorDetails[0].stepId).toBe('duns_c');
      expect(auth.cancelSubscription).toHaveBeenCalledTimes(1);
    });

    it('passes the asOf / limit through to findDueSteps', async () => {
      dunning.findDueSteps.mockResolvedValueOnce([]);
      const asOf = new Date('2026-02-01T00:00:00Z');
      await worker.processDueSteps({ asOf, limit: 7 });
      expect(dunning.findDueSteps).toHaveBeenCalledWith({ asOf, limit: 7 });
    });
  });
});
