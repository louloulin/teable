/**
 * Controller factory — NestJS auth service spec (Stage 91).
 */

import { ControllerFactoryAuthService } from './controller-factory.auth.service';

interface IPrismaMock {
  controllerSpec: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
}

function makePrisma(): IPrismaMock {
  const store = new Map<string, Record<string, unknown>>();
  return {
    controllerSpec: {
      upsert: vi.fn(async (args: unknown) => {
        const w = (args as { where: { id: string }; create: Record<string, unknown>; update?: Record<string, unknown> }).where;
        const create = (args as { create: Record<string, unknown>; update?: Record<string, unknown> }).create;
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

const baseController = () => ({
  resource: 'risk-policies',
  routes: [
    { path: '/', verb: 'list', operationId: 'listRiskPolicies', authRequired: true },
    { path: ':id', verb: 'get', operationId: 'getRiskPolicy', authRequired: true },
  ],
});

describe('ControllerFactoryAuthService.upsertController', () => {
  it('persists', async () => {
    const svc = new ControllerFactoryAuthService(makePrisma() as never);
    await svc.upsertController({ controller: baseController() });
    const table = await svc.loadRouteTable();
    expect(table.controllers.length).toBe(1);
  });
  it('rejects invalid', async () => {
    const svc = new ControllerFactoryAuthService(makePrisma() as never);
    await expect(
      svc.upsertController({
        controller: { resource: '', routes: [] },
      })
    ).rejects.toThrow();
  });
});

describe('ControllerFactoryAuthService.findRoute', () => {
  it('found', async () => {
    const svc = new ControllerFactoryAuthService(makePrisma() as never);
    await svc.upsertController({ controller: baseController() });
    const r = await svc.findRoute({ resource: 'risk-policies', operationId: 'getRiskPolicy' });
    expect(r?.verb).toBe('get');
  });
  it('null when missing', async () => {
    const svc = new ControllerFactoryAuthService(makePrisma() as never);
    expect(await svc.findRoute({ resource: 'nope', operationId: 'x' })).toBeNull();
  });
});

describe('ControllerFactoryAuthService.totalRoutes', () => {
  it('sums', async () => {
    const svc = new ControllerFactoryAuthService(makePrisma() as never);
    await svc.upsertController({ controller: baseController() });
    expect(await svc.totalRoutes()).toBe(2);
  });
});

describe('ControllerFactoryAuthService.authedRoutes', () => {
  it('filters', async () => {
    const svc = new ControllerFactoryAuthService(makePrisma() as never);
    await svc.upsertController({
      controller: {
        resource: 'public',
        routes: [
          { path: '/', verb: 'list', operationId: 'listPublic', authRequired: false },
        ],
      },
    });
    await svc.upsertController({ controller: baseController() });
    const out = await svc.authedRoutes();
    expect(out.length).toBe(2);
  });
});

describe('ControllerFactoryAuthService.appendController', () => {
  it('appends', async () => {
    const svc = new ControllerFactoryAuthService(makePrisma() as never);
    const out = await svc.appendController({ controller: baseController() });
    expect(out.controllers.length).toBe(1);
  });
});
