/**
 * E2E test utils — NestJS auth service spec (Stage 94).
 */

import { E2ETestUtilsAuthService } from './e2e-test-utils.auth.service';
import type { ITestFixture } from './e2e-test-utils.types';

interface IPrismaMock {
  testFixture: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  };
  testCallLog: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  const fixtureStore = new Map<string, Record<string, unknown>>();
  const callLogStore: Array<Record<string, unknown>> = [];
  return {
    testFixture: {
      upsert: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string } }).where;
        const create = (args as { create: Record<string, unknown> }).create;
        const update = (args as { update?: Record<string, unknown> }).update;
        const existing = fixtureStore.get(w.id);
        if (existing) Object.assign(existing, update ?? {});
        else fixtureStore.set(w.id, { ...create });
        return undefined;
      }),
      findUnique: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string } }).where;
        return fixtureStore.get(w.id) ?? null;
      }),
    },
    testCallLog: {
      create: vi.fn(async (args: unknown) => {
        const data = (args as { data: Record<string, unknown> }).data;
        callLogStore.push({ ...data });
        return undefined;
      }),
      findMany: vi.fn(async (args: unknown) => {
        const w = (args as { where: { seed: string } }).where;
        return callLogStore.filter((r) => r['seed'] === w.seed);
      }),
    },
  };
}

const baseFixture = (): ITestFixture => ({
  org: { id: 'org-1', name: 'Acme', plan: 'pro' },
  users: [{ id: 'u-1', email: 'a@b.com', roles: ['admin'] }],
  tokens: { 'u-1': 'tok-1' },
  seed: 'seed-1',
});

describe('E2ETestUtilsAuthService.saveFixture', () => {
  it('persists', async () => {
    const svc = new E2ETestUtilsAuthService(makePrisma() as never);
    await svc.saveFixture({ fixture: baseFixture() });
    const loaded = await svc.loadFixture({ seed: 'seed-1' });
    expect(loaded?.org.id).toBe('org-1');
  });
  it('rejects invalid', async () => {
    const svc = new E2ETestUtilsAuthService(makePrisma() as never);
    await expect(
      svc.saveFixture({
        fixture: {
          ...baseFixture(),
          users: [{ id: 'u-1', email: 'no-at', roles: [] }],
        },
      })
    ).rejects.toThrow();
  });
});

describe('E2ETestUtilsAuthService.loadFixture', () => {
  it('null when missing', async () => {
    const svc = new E2ETestUtilsAuthService(makePrisma() as never);
    expect(await svc.loadFixture({ seed: 'nope' })).toBeNull();
  });
});

describe('E2ETestUtilsAuthService.headersFor', () => {
  it('bearer', () => {
    const svc = new E2ETestUtilsAuthService(makePrisma() as never);
    const h = svc.headersFor({ fixture: baseFixture(), userId: 'u-1' });
    expect(h['authorization']).toBe('Bearer tok-1');
  });
  it('no token', () => {
    const svc = new E2ETestUtilsAuthService(makePrisma() as never);
    const h = svc.headersFor({ fixture: baseFixture(), userId: 'nope' });
    expect(h['authorization']).toBeUndefined();
  });
});

describe('E2ETestUtilsAuthService.validateCall', () => {
  it('passes', () => {
    const svc = new E2ETestUtilsAuthService(makePrisma() as never);
    expect(svc.validateCall({ verb: 'GET', path: '/api/x' })).toBeNull();
  });
});

describe('E2ETestUtilsAuthService.buildCall', () => {
  it('builds', () => {
    const svc = new E2ETestUtilsAuthService(makePrisma() as never);
    const c = svc.buildCall({ userId: 'u-1', verb: 'GET', path: '/api/x' });
    expect(c.headers?.['authorization']).toContain('Bearer');
  });
});

describe('E2ETestUtilsAuthService.recordCall', () => {
  it('records', async () => {
    const svc = new E2ETestUtilsAuthService(makePrisma() as never);
    const fixture = baseFixture();
    await svc.recordCall({
      fixture,
      call: { verb: 'GET', path: '/api/x' },
      result: { status: 200, body: null, headers: {}, durationMs: 12 },
    });
    const logs = await svc.listCallLogs({ seed: 'seed-1' });
    expect(logs.length).toBe(1);
    expect(logs[0]?.status).toBe(200);
  });
  it('empty list', async () => {
    const svc = new E2ETestUtilsAuthService(makePrisma() as never);
    expect(await svc.listCallLogs({ seed: 'nope' })).toEqual([]);
  });
});