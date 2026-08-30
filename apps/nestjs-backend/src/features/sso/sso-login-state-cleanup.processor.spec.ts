import { vi, type Mock } from 'vitest';

import { SsoLoginStateCleanupProcessor } from './sso-login-state-cleanup.processor';
import { SSO_LOGIN_STATE_CLEANUP_QUEUE, SSO_LOGIN_STATE_TTL_MS } from './sso.constants';

interface IMockPrisma {
  ssoLoginState: { deleteMany: Mock };
}

interface IMockQueue {
  add: Mock;
  close: Mock;
}

const buildPrismaMock = (deletedCount = 0): IMockPrisma => ({
  ssoLoginState: {
    deleteMany: vi.fn(async () => ({ count: deletedCount })),
  },
});

const buildQueueMock = (): IMockQueue => ({
  add: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
});

const buildProcessor = (prisma: IMockPrisma, queue: IMockQueue) =>
  new SsoLoginStateCleanupProcessor(prisma as never, queue as never);

describe('SsoLoginStateCleanupProcessor — Stage 4.2', () => {
  let prisma: IMockPrisma;
  let queue: IMockQueue;
  let svc: SsoLoginStateCleanupProcessor;

  beforeEach(() => {
    prisma = buildPrismaMock();
    queue = buildQueueMock();
    svc = buildProcessor(prisma, queue);
  });

  it('returns 0 when no rows are expired', async () => {
    prisma.ssoLoginState.deleteMany.mockResolvedValueOnce({ count: 0 });
    const out = await svc.process({} as never);
    expect(out).toEqual({ deleted: 0 });
    expect(prisma.ssoLoginState.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: expect.any(Date) } },
    });
  });

  it('passes a cutoff exactly TTL_MS in the past', async () => {
    const before = Date.now();
    await svc.process({} as never);
    const cutoff = prisma.ssoLoginState.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    const after = Date.now();
    expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - SSO_LOGIN_STATE_TTL_MS);
    expect(cutoff.getTime()).toBeLessThanOrEqual(after - SSO_LOGIN_STATE_TTL_MS);
  });

  it('does NOT add a `consumed` filter — callback-completed rows are also reaped', async () => {
    await svc.process({} as never);
    const where = prisma.ssoLoginState.deleteMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('consumed');
    expect(where).not.toHaveProperty('consumedAt');
  });

  it('reports the deleted count returned by Prisma', async () => {
    prisma.ssoLoginState.deleteMany.mockResolvedValueOnce({ count: 42 });
    const out = await svc.process({} as never);
    expect(out.deleted).toBe(42);
  });

  it('schedules a repeatable cleanup job on init', async () => {
    await svc.onModuleInit();
    expect(queue.add).toHaveBeenCalledWith(
      'cleanup',
      {},
      expect.objectContaining({
        jobId: 'sso-login-state-cleanup-repeat',
        repeat: expect.objectContaining({ every: 60_000 }),
      })
    );
  });

  it('closes the queue on destroy', async () => {
    await svc.onModuleDestroy();
    expect(queue.close).toHaveBeenCalledTimes(1);
  });

  it('uses the SSO_LOGIN_STATE_CLEANUP_QUEUE constant for processor binding', () => {
    // Static check — protects against drift between module wiring and the
    // bullmq worker registration.
    expect(SSO_LOGIN_STATE_CLEANUP_QUEUE).toBe('sso-login-state-cleanup');
  });
});
