/**
 * Module wiring — NestJS auth service spec (Stage 90).
 */

import { ModuleWiringAuthService } from './module-wiring.auth.service';

interface IPrismaMock {
  moduleEntry: {
    upsert: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  const store = new Map<string, Record<string, unknown>>();
  return {
    moduleEntry: {
      upsert: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string }; create: Record<string, unknown>; update?: Record<string, unknown> }).where;
        const create = (args as { create: Record<string, unknown>; update?: Record<string, unknown> }).create;
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
      findMany: vi.fn(async () => [...store.values()]),
    },
  };
}

const baseEntry = () => ({
  name: 'risk-policy-engine' as const,
  registered: true,
  hasController: true,
  guarded: true,
});

describe('ModuleWiringAuthService.upsertEntry', () => {
  it('persists', async () => {
    const svc = new ModuleWiringAuthService(makePrisma() as never);
    const out = await svc.upsertEntry({ entry: baseEntry() });
    expect(out.name).toBe('risk-policy-engine');
  });
  it('rejects invalid', async () => {
    const svc = new ModuleWiringAuthService(makePrisma() as never);
    await expect(
      svc.upsertEntry({ entry: { ...baseEntry(), hasController: false } })
    ).rejects.toThrow();
  });
});

describe('ModuleWiringAuthService.patchEntry', () => {
  it('patches', async () => {
    const prisma = makePrisma();
    const svc = new ModuleWiringAuthService(prisma as never);
    await svc.upsertEntry({ entry: baseEntry() });
    const out = await svc.patchEntry({ name: 'risk-policy-engine', patch: { guarded: false } });
    expect(out.guarded).toBe(false);
  });
  it('throws when missing', async () => {
    const svc = new ModuleWiringAuthService(makePrisma() as never);
    await expect(svc.patchEntry({ name: 'risk-policy-engine', patch: {} })).rejects.toThrow(
      /not found/
    );
  });
});

describe('ModuleWiringAuthService.manifest', () => {
  it('aggregates', async () => {
    const svc = new ModuleWiringAuthService(makePrisma() as never);
    await svc.upsertEntry({ entry: baseEntry() });
    const m = await svc.manifest('2026-01-01T00:00:00Z');
    expect(m.entries.length).toBe(1);
    expect(m.missing.length).toBeGreaterThan(0);
  });
});

describe('ModuleWiringAuthService.coverage', () => {
  it('counts', async () => {
    const svc = new ModuleWiringAuthService(makePrisma() as never);
    await svc.upsertEntry({ entry: baseEntry() });
    const out = await svc.coverage();
    expect(out.registered).toBe(1);
    expect(out.withController).toBe(1);
    expect(out.guarded).toBe(1);
  });
});

describe('ModuleWiringAuthService.diffSince', () => {
  it('newly registered', async () => {
    const svc = new ModuleWiringAuthService(makePrisma() as never);
    await svc.upsertEntry({ entry: baseEntry() });
    const out = await svc.diffSince([]);
    expect(out).toEqual(['risk-policy-engine']);
  });
});

describe('ModuleWiringAuthService.loadEntry', () => {
  it('returns null when missing', async () => {
    const svc = new ModuleWiringAuthService(makePrisma() as never);
    expect(await svc.loadEntry('risk-policy-engine')).toBeNull();
  });
});
