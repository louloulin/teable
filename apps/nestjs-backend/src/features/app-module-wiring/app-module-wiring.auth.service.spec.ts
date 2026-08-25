/**
 * App module wiring — NestJS auth service spec (Stage 95).
 */

import { AppModuleWiringAuthService } from './app-module-wiring.auth.service';
import type { IModuleWire } from './app-module-wiring.types';

interface IPrismaMock {
  appModuleWire: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  const store = new Map<string, Record<string, unknown>>();
  return {
    appModuleWire: {
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

const baseWire = (over: Partial<IModuleWire> = {}): IModuleWire => ({
  name: 'X',
  category: 'feature',
  round: 18,
  required: true,
  ...over,
});

describe('AppModuleWiringAuthService.upsertWire', () => {
  it('persists', async () => {
    const svc = new AppModuleWiringAuthService(makePrisma() as never);
    await svc.upsertWire({ wire: baseWire() });
    expect(await svc.count()).toBe(1);
  });
});

describe('AppModuleWiringAuthService.installOrder', () => {
  it('orders', async () => {
    const svc = new AppModuleWiringAuthService(makePrisma() as never);
    await svc.upsertWire({ wire: baseWire({ name: 'F', category: 'feature' }) });
    await svc.upsertWire({ wire: baseWire({ name: 'C', category: 'core' }) });
    const order = await svc.installOrder();
    expect(order[0]).toBe('C');
  });
});

describe('AppModuleWiringAuthService.hasAllRequired', () => {
  it('yes', async () => {
    const svc = new AppModuleWiringAuthService(makePrisma() as never);
    await svc.upsertWire({ wire: baseWire({ name: 'A', required: true }) });
    expect(await svc.hasAllRequired({ provided: ['A'] })).toBe(true);
  });
  it('no', async () => {
    const svc = new AppModuleWiringAuthService(makePrisma() as never);
    await svc.upsertWire({ wire: baseWire({ name: 'A', required: true }) });
    expect(await svc.hasAllRequired({ provided: [] })).toBe(false);
  });
});

describe('AppModuleWiringAuthService.requiredNames', () => {
  it('filters', async () => {
    const svc = new AppModuleWiringAuthService(makePrisma() as never);
    await svc.upsertWire({ wire: baseWire({ name: 'A', required: true }) });
    await svc.upsertWire({ wire: baseWire({ name: 'B', required: false }) });
    expect(await svc.requiredNames()).toEqual(['A']);
  });
});

describe('AppModuleWiringAuthService.filterByCategory', () => {
  it('filters', async () => {
    const svc = new AppModuleWiringAuthService(makePrisma() as never);
    await svc.upsertWire({ wire: baseWire({ name: 'A', category: 'core' }) });
    await svc.upsertWire({ wire: baseWire({ name: 'B', category: 'feature' }) });
    expect((await svc.filterByCategory({ category: 'core' })).length).toBe(1);
  });
});

describe('AppModuleWiringAuthService.filterByRound', () => {
  it('filters', async () => {
    const svc = new AppModuleWiringAuthService(makePrisma() as never);
    await svc.upsertWire({ wire: baseWire({ name: 'A', round: 18 }) });
    await svc.upsertWire({ wire: baseWire({ name: 'B', round: 17 }) });
    expect((await svc.filterByRound({ round: 18 })).length).toBe(1);
  });
});

describe('AppModuleWiringAuthService.findWire', () => {
  it('found', async () => {
    const svc = new AppModuleWiringAuthService(makePrisma() as never);
    await svc.upsertWire({ wire: baseWire({ name: 'A' }) });
    expect((await svc.findWire({ name: 'A' }))?.name).toBe('A');
  });
  it('null', async () => {
    const svc = new AppModuleWiringAuthService(makePrisma() as never);
    expect(await svc.findWire({ name: 'nope' })).toBeNull();
  });
});

describe('AppModuleWiringAuthService.mergeWithExtra', () => {
  it('merges', async () => {
    const svc = new AppModuleWiringAuthService(makePrisma() as never);
    await svc.upsertWire({ wire: baseWire({ name: 'A' }) });
    const out = await svc.mergeWithExtra({ extra: [baseWire({ name: 'B' })] });
    expect(out.modules.length).toBe(2);
  });
});