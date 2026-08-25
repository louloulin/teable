/**
 * Interceptor guard — NestJS auth service spec (Stage 92).
 */

import { InterceptorGuardAuthService } from './interceptor-guard.auth.service';
import type { IAuthContext } from './interceptor-guard.types';

interface IPrismaMock {
  guardAudit: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    count: (args: unknown) => Promise<number>;
  };
}

function makePrisma(): IPrismaMock {
  const store = new Map<string, Record<string, unknown>>();
  return {
    guardAudit: {
      upsert: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string } }).where;
        const create = (args as { create: Record<string, unknown> }).create;
        const update = (args as { update?: Record<string, unknown> }).update;
        const existing = store.get(w.id);
        if (existing) Object.assign(existing, update ?? {});
        else store.set(w.id, { ...create });
        return undefined;
      }),
      findUnique: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string } }).where;
        return store.get(w.id) ?? null;
      }),
      count: vi.fn(async (args: unknown) => {
        const w = (args as { where: { action: string } }).where;
        let n = 0;
        for (const v of store.values()) {
          if (v['action'] === w.action) n++;
        }
        return n;
      }),
    },
  };
}

const baseCtx = (over: Partial<IAuthContext> = {}): IAuthContext => ({
  principal: 'user-1',
  roles: ['member'],
  action: 'read',
  ...over,
});

describe('InterceptorGuardAuthService.authorize', () => {
  it('allows when no roles required', async () => {
    const svc = new InterceptorGuardAuthService(makePrisma() as never);
    const r = await svc.authorize({
      ctx: baseCtx(),
      traceId: 't-1',
      now: '2026-08-25T00:00:00.000Z',
    });
    expect(r.allowed).toBe(true);
    expect(r.audit.outcome).toBe('ok');
  });
  it('denies when role missing', async () => {
    const svc = new InterceptorGuardAuthService(makePrisma() as never);
    const r = await svc.authorize({
      ctx: baseCtx({ roles: ['guest'] }),
      requiredRoles: ['admin'],
      traceId: 't-2',
      now: '2026-08-25T00:00:00.000Z',
    });
    expect(r.allowed).toBe(false);
    expect(r.audit.outcome).toBe('denied');
  });
});

describe('InterceptorGuardAuthService.guard', () => {
  it('allowed', async () => {
    const svc = new InterceptorGuardAuthService(makePrisma() as never);
    const r = await svc.guard({
      ctx: baseCtx(),
      traceId: 't-3',
      now: '2026-08-25T00:00:00.000Z',
    });
    expect(r.allowed).toBe(true);
    expect(r.error).toBeUndefined();
  });
  it('forbidden for authenticated principal missing role', async () => {
    const svc = new InterceptorGuardAuthService(makePrisma() as never);
    const r = await svc.guard({
      ctx: baseCtx({ roles: ['guest'] }),
      requiredRoles: ['admin'],
      traceId: 't-4',
      now: '2026-08-25T00:00:00.000Z',
    });
    expect(r.allowed).toBe(false);
    expect(r.error?.code).toBe('forbidden');
  });
  it('unauthorized for anonymous principal', async () => {
    const svc = new InterceptorGuardAuthService(makePrisma() as never);
    const r = await svc.guard({
      ctx: baseCtx({ principal: null }),
      requiredRoles: ['member'],
      traceId: 't-5',
      now: '2026-08-25T00:00:00.000Z',
    });
    expect(r.allowed).toBe(false);
    expect(r.error?.code).toBe('unauthorized');
  });
});

describe('InterceptorGuardAuthService.findAuditByTrace', () => {
  it('found', async () => {
    const svc = new InterceptorGuardAuthService(makePrisma() as never);
    await svc.guard({
      ctx: baseCtx(),
      traceId: 't-6',
      now: '2026-08-25T00:00:00.000Z',
    });
    const a = await svc.findAuditByTrace({ traceId: 't-6' });
    expect(a?.outcome).toBe('ok');
  });
  it('null when missing', async () => {
    const svc = new InterceptorGuardAuthService(makePrisma() as never);
    expect(await svc.findAuditByTrace({ traceId: 'nope' })).toBeNull();
  });
});

describe('InterceptorGuardAuthService.countByAction', () => {
  it('counts', async () => {
    const svc = new InterceptorGuardAuthService(makePrisma() as never);
    await svc.guard({
      ctx: baseCtx({ action: 'create' }),
      traceId: 't-7',
      now: '2026-08-25T00:00:00.000Z',
    });
    expect(await svc.countByAction({ action: 'create' })).toBe(1);
  });
});