/**
 * Conflict replay queue — NestJS auth service spec (Stage 87).
 */

import { ConflictReplayAuthService } from './conflict-replay.auth.service';
import type { IConflictEvent } from './conflict-replay.types';

interface IPrismaMock {
  conflictEvent: {
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    upsert: (args: unknown) => Promise<unknown>;
    delete: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  const store = new Map<string, Record<string, unknown>>();
  return {
    conflictEvent: {
      findFirst: vi.fn(async (args: unknown) => {
        const where = (args as { where: { orgId: string } }).where;
        let max: Record<string, unknown> | null = null;
        for (const r of store.values()) {
          if (r['orgId'] !== where.orgId) continue;
          if (!max || Number(r['offset']) > Number(max['offset'])) max = r;
        }
        return max;
      }),
      findMany: vi.fn(async (args: unknown) => {
        const where = (args as { where: { orgId: string } }).where;
        return [...store.values()].filter((r) => r['orgId'] === where.orgId);
      }),
      upsert: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string }; create: Record<string, unknown>; update?: Record<string, unknown> }).where;
        const create = (args as { create: Record<string, unknown>; update?: Record<string, unknown> }).create;
        const update = (args as { update?: Record<string, unknown> }).update;
        const existing = store.get(w.id);
        if (existing) {
          Object.assign(existing, update ?? {});
        } else {
          store.set(w.id, { ...create });
        }
        return undefined;
      }),
      delete: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string } }).where;
        store.delete(w.id);
        return undefined;
      }),
    },
  };
}

describe('ConflictReplayAuthService.enqueueConflict', () => {
  it('assigns increasing offset', async () => {
    const prisma = makePrisma();
    const svc = new ConflictReplayAuthService(prisma as never);
    await svc.enqueueConflict({
      orgId: 'o1',
      recordId: 'r1',
      kind: 'optimistic-lock',
      idempotencyKey: 'k1',
      now: Date.parse('2026-01-01T00:00:00Z'),
    });
    await svc.enqueueConflict({
      orgId: 'o1',
      recordId: 'r2',
      kind: 'duplicate-write',
      idempotencyKey: 'k2',
      now: Date.parse('2026-01-01T00:00:01Z'),
    });
    const evt1 = await svc.enqueueConflict({
      orgId: 'o1',
      recordId: 'r3',
      kind: 'stale-read',
      idempotencyKey: 'k3',
      now: Date.parse('2026-01-01T00:00:02Z'),
    });
    expect(evt1.offset).toBe(2);
  });
});

describe('ConflictReplayAuthService.drainQueue', () => {
  it('drains success and persists remaining', async () => {
    const prisma = makePrisma();
    const svc = new ConflictReplayAuthService(prisma as never);
    const e: IConflictEvent = await svc.enqueueConflict({
      orgId: 'o1',
      recordId: 'r1',
      kind: 'optimistic-lock',
      idempotencyKey: 'k1',
      now: Date.parse('2026-01-01T00:00:00Z'),
    });
    const out = await svc.drainQueue({
      orgId: 'o1',
      applier: () => true,
      now: Date.parse('2026-01-02T00:00:00Z'),
    });
    expect(out.attempts.length).toBe(1);
    expect(out.remaining.length).toBe(0);
    expect(e.attempts).toBe(0);
  });
  it('keeps failed', async () => {
    const prisma = makePrisma();
    const svc = new ConflictReplayAuthService(prisma as never);
    await svc.enqueueConflict({
      orgId: 'o1',
      recordId: 'r1',
      kind: 'optimistic-lock',
      idempotencyKey: 'k1',
      now: Date.parse('2026-01-01T00:00:00Z'),
    });
    const out = await svc.drainQueue({
      orgId: 'o1',
      applier: () => false,
      now: Date.parse('2026-01-02T00:00:00Z'),
    });
    expect(out.remaining.length).toBe(1);
    expect(out.attempts[0]?.ok).toBe(false);
  });
});

describe('ConflictReplayAuthService helpers', () => {
  it('re-exports', () => {
    const svc = new ConflictReplayAuthService(makePrisma() as never);
    expect(typeof svc.canRetry).toBe('function');
    expect(typeof svc.enqueue).toBe('function');
  });
});
