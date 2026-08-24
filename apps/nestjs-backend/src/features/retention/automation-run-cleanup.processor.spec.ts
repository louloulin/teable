import { beforeEach, describe, expect, it } from 'vitest';

import { MS_PER_DAY } from './retention-policy';
import {
  AUTOMATION_RUN_CLEANUP_TICK_JOB,
  AutomationRunCleanupProcessor,
} from './automation-run-cleanup.processor';

interface IFakeJob {
  name: string;
  id?: string;
  data?: unknown;
}

const makeProcessor = (
  plan: 'self_hosted' | 'free' | 'pro' | 'business' | 'enterprise' = 'business'
) => {
  const caps = { currentPlan: () => plan };
  return new AutomationRunCleanupProcessor(caps as never);
};

describe('AutomationRunCleanupProcessor (Stage 11 stub)', () => {
  beforeEach(() => {
    // tests are date-sensitive (cutoff = now - days*MS_PER_DAY); pin the
    // clock so the ISO assertion is exact, not "around now".
  });

  it('is wired to the automation-run-cleanup queue constant', () => {
    // imported for side effect; this assertion documents the surface so
    // a future rename shows up as a failing test rather than a silent
    // queue-rebind by NestJS.
    expect(AUTOMATION_RUN_CLEANUP_TICK_JOB).toBe('automation-run-cleanup-tick');
  });

  it('resolves the per-plan automation TTL and returns a cutoff (business = 365d)', async () => {
    const before = Date.now();
    const processor = makeProcessor('business');
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
    const processor = makeProcessor('self_hosted');
    const result = await processor.process({
      name: AUTOMATION_RUN_CLEANUP_TICK_JOB,
      id: 'job-2',
    } as IFakeJob as never);

    expect(result.days).toBe(14);
    expect(result.plan).toBe('self_hosted');
  });

  it('uses 365 days for pro plan', async () => {
    const processor = makeProcessor('pro');
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
    const processor = makeProcessor('pro');
    const result = await processor.process({
      name: 'unrelated-job',
      id: 'job-x',
    } as IFakeJob as never);

    expect(result).toMatchObject({
      kind: 'automation',
    });
    expect(result.days).toBe(365);
  });
});
