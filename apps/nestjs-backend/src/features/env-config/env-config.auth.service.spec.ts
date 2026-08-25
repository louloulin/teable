/**
 * Env config — NestJS auth service spec (Stage 96).
 */

import { EnvConfigAuthService } from './env-config.auth.service';
import type { IEnvSpec } from './env-config.types';

interface IPrismaMock {
  envSpec: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  const store = new Map<string, Record<string, unknown>>();
  return {
    envSpec: {
      upsert: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string } }).where;
        const create = (args as { create: Record<string, unknown> }).create;
        const update = (args as { update?: Record<string, unknown> }).update;
        const existing = store.get(w.id);
        if (existing) Object.assign(existing, update ?? {});
        else store.set(w.id, { ...create });
        return undefined;
      }),
      findMany: vi.fn(async () => [...store.values()]),
    },
  };
}

const baseSpec = (over: Partial<IEnvSpec> = {}): IEnvSpec => ({
  name: 'TEST_VAR',
  required: false,
  kind: 'string',
  default: 'x',
  ...over,
});

describe('EnvConfigAuthService.upsertSpec', () => {
  it('persists', async () => {
    const svc = new EnvConfigAuthService(makePrisma() as never);
    await svc.upsertSpec({ spec: baseSpec() });
    const r = await svc.resolve({ env: {} });
    expect(r.values['TEST_VAR']).toBe('x');
  });
  it('rejects invalid', async () => {
    const svc = new EnvConfigAuthService(makePrisma() as never);
    await expect(svc.upsertSpec({ spec: baseSpec({ name: '' }) })).rejects.toThrow();
  });
});

describe('EnvConfigAuthService.resolve', () => {
  it('valid', async () => {
    const svc = new EnvConfigAuthService(makePrisma() as never);
    await svc.upsertSpec({ spec: baseSpec({ name: 'A', required: true, default: undefined }) });
    const r = await svc.resolve({ env: { A: 'v' } });
    expect(r.valid).toBe(true);
    expect(r.values['A']).toBe('v');
  });
  it('invalid (required missing, no default)', async () => {
    const svc = new EnvConfigAuthService(makePrisma() as never);
    await svc.upsertSpec({ spec: baseSpec({ name: 'A', required: true, default: undefined }) });
    const r = await svc.resolve({ env: {} });
    expect(r.valid).toBe(false);
  });
});

describe('EnvConfigAuthService.loadValidated', () => {
  it('passes', async () => {
    const svc = new EnvConfigAuthService(makePrisma() as never);
    await svc.upsertSpec({ spec: baseSpec({ name: 'A', required: true, default: 'x' }) });
    const out = await svc.loadValidated({ env: {} });
    expect(out.values['A']).toBe('x');
  });
  it('throws when invalid', async () => {
    const svc = new EnvConfigAuthService(makePrisma() as never);
    await svc.upsertSpec({ spec: baseSpec({ name: 'A', required: true, default: undefined }) });
    await expect(svc.loadValidated({ env: {} })).rejects.toThrow();
  });
});

describe('EnvConfigAuthService helpers', () => {
  it('bool', () => {
    const svc = new EnvConfigAuthService(makePrisma() as never);
    expect(svc.bool({ name: 'A', env: { A: 'true' } })).toBe(true);
  });
  it('num', () => {
    const svc = new EnvConfigAuthService(makePrisma() as never);
    expect(svc.num({ name: 'A', env: { A: '3' }, fallback: 0 })).toBe(3);
  });
  it('opt', () => {
    const svc = new EnvConfigAuthService(makePrisma() as never);
    expect(svc.opt({ name: 'A', env: { A: 'x' }, fallback: 'y' })).toBe('x');
  });
  it('req', () => {
    const svc = new EnvConfigAuthService(makePrisma() as never);
    expect(svc.req({ name: 'A', env: { A: 'x' } })).toBe('x');
  });
});