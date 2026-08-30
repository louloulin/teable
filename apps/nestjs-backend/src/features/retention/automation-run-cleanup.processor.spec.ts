import { describe, expect, it, vi } from 'vitest';

import {
  AUTOMATION_RUN_CLEANUP_REPEAT_MS,
  AUTOMATION_RUN_CLEANUP_TICK_JOB,
  AutomationRunCleanupProcessor,
} from './automation-run-cleanup.processor';
import { MS_PER_DAY } from './retention-policy';

interface IFakeJob {
  name: string;
  id?: string;
  data?: unknown;
}

const makeProcessor = (
  plan: 'self_hosted' | 'free' | 'pro' | 'business' | 'enterprise' = 'business'
) => {
  const caps = { currentPlan: () => plan };
  const prisma = {
    spaceQuota: { findMany: vi.fn().mockResolvedValue([]) },
    base: { findMany: vi.fn().mockResolvedValue([]) },
    automation: { findMany: vi.fn().mockResolvedValue([]) },
    automationRun: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const queue = { add: vi.fn().mockResolvedValue(undefined) };
  return {
    processor: new AutomationRunCleanupProcessor(prisma as never, caps as never, queue as never),
    prisma,
    queue,
  };
};

describe('AutomationRunCleanupProcessor', () => {
  it('is wired to the automation-run-cleanup queue constant', () => {
    // imported for side effect; this assertion documents the surface so
    // a future rename shows up as a failing test rather than a silent
    // queue-rebind by NestJS.
    expect(AUTOMATION_RUN_CLEANUP_TICK_JOB).toBe('automation-run-cleanup-tick');
  });

  it('resolves the per-plan automation TTL and returns a cutoff (business = 365d)', async () => {
    const before = Date.now();
    const { processor } = makeProcessor('business');
    const result = await processor.process({
      name: AUTOMATION_RUN_CLEANUP_TICK_JOB,
      id: 'job-1',
    } as IFakeJob as never);
    const after = Date.now();

    expect(result.plan).toBe('business');
    expect(result.kind).toBe('automation');
    expect(result.days).toBe(365);
    // cutoff is the timestamp the future real worker would use: now - 365d.
    const cutoff = new Date(result.cutoff).getTime();
    const expected = after - 365 * MS_PER_DAY;
    // bound it to ±1s so a slow test runner does not flake the assertion
    expect(Math.abs(cutoff - (before - 365 * MS_PER_DAY))).toBeLessThan(1_000);
    expect(Math.abs(cutoff - expected)).toBeLessThan(1_000);
  });

  it('falls back to 14 days for self_hosted plan', async () => {
    const { processor } = makeProcessor('self_hosted');
    const result = await processor.process({
      name: AUTOMATION_RUN_CLEANUP_TICK_JOB,
      id: 'job-2',
    } as IFakeJob as never);

    expect(result.days).toBe(14);
    expect(result.plan).toBe('self_hosted');
  });

  it('uses 365 days for pro plan', async () => {
    const { processor } = makeProcessor('pro');
    const result = await processor.process({
      name: AUTOMATION_RUN_CLEANUP_TICK_JOB,
      id: 'job-3',
    } as IFakeJob as never);

    expect(result.days).toBe(365);
  });

  it('does not throw when given an unknown job name', async () => {
    // the queue binding routes by queue name, but a misconfigured producer
    // could enqueue a different `name`; the processor must ignore it rather
    // than crash the bull worker.
    const { processor } = makeProcessor('pro');
    const result = await processor.process({
      name: 'unrelated-job',
      id: 'job-x',
    } as IFakeJob as never);

    expect(result).toMatchObject({
      kind: 'automation',
    });
    expect(result.days).toBe(365);
  });

  it('schedules one repeatable cleanup job', async () => {
    const { processor, queue } = makeProcessor();
    await processor.onModuleInit();
    await processor.onModuleInit();
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      AUTOMATION_RUN_CLEANUP_TICK_JOB,
      {},
      expect.objectContaining({
        jobId: AUTOMATION_RUN_CLEANUP_TICK_JOB,
        repeat: { every: AUTOMATION_RUN_CLEANUP_REPEAT_MS },
      })
    );
  });

  it('deletes expired runs using each space quota retention', async () => {
    const { processor, prisma } = makeProcessor('business');
    prisma.spaceQuota.findMany.mockResolvedValue([
      { spaceId: 'sp-pro', plan: 'pro', automationHistoryDays: 365 },
      { spaceId: 'sp-free', plan: 'free', automationHistoryDays: 14 },
      { spaceId: 'sp-unlimited', plan: 'self_hosted', automationHistoryDays: null },
    ]);
    prisma.base.findMany
      .mockResolvedValueOnce([{ id: 'base-pro' }])
      .mockResolvedValueOnce([{ id: 'base-free' }]);
    prisma.automation.findMany
      .mockResolvedValueOnce([{ id: 'automation-pro' }])
      .mockResolvedValueOnce([{ id: 'automation-free' }]);
    prisma.automationRun.deleteMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });

    const result = await processor.process({
      name: AUTOMATION_RUN_CLEANUP_TICK_JOB,
      id: 'job-retention',
    } as IFakeJob as never);

    expect(result).toMatchObject({ deleted: 3, spaces: 3 });
    expect(prisma.automationRun.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.automationRun.deleteMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          automationId: { in: ['automation-pro'] },
        }),
      })
    );
    expect(prisma.automationRun.deleteMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          automationId: { in: ['automation-free'] },
        }),
      })
    );
  });

  it('uses the current plan fallback when no space quotas exist', async () => {
    const { processor, prisma } = makeProcessor('pro');
    prisma.automationRun.deleteMany.mockResolvedValue({ count: 4 });
    const result = await processor.process({
      name: AUTOMATION_RUN_CLEANUP_TICK_JOB,
      id: 'job-fallback',
    } as IFakeJob as never);

    expect(result).toMatchObject({ deleted: 4, spaces: 0, days: 365 });
    expect(prisma.automationRun.deleteMany).toHaveBeenCalledWith({
      where: { createdTime: expect.objectContaining({ lt: expect.any(Date) }) },
    });
  });
});
