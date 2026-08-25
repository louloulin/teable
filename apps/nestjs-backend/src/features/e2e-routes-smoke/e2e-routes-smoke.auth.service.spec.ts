/**
 * E2E routes smoke — NestJS auth service spec (Stage 101).
 */

import { E2eRoutesSmokeAuthService } from './e2e-routes-smoke.auth.service';
import { ControllerFactoryAuthService } from '../controller-factory/controller-factory.auth.service';
import { buildRouteTable } from '../controller-factory/controller-factory.service';
import type { IControllerSpec } from '../controller-factory/controller-factory.types';
import type { ISmokeInvoker } from './e2e-routes-smoke.types';

interface IPrismaMock {
  controllerSpec: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany: () => Promise<unknown[]>;
    findFirst: (args: unknown) => Promise<unknown>;
  };
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}

function makePrisma(rows: Array<{ resource: string; routes: unknown }> = []): IPrismaMock {
  const byRes = new Map<string, { resource: string; routes: unknown }>();
  for (const r of rows) byRes.set(r.resource, r);
  return {
    controllerSpec: {
      upsert: vi.fn(async ({ where, create, update }: any) => {
        const id = where?.id ?? create.id;
        const next = { id, resource: create.resource, routes: update?.routes ?? create.routes };
        byRes.set(id, next);
        return next;
      }),
      findMany: vi.fn(async () => Array.from(byRes.values())),
      findFirst: vi.fn(async ({ where }: any) => byRes.get(where?.id) ?? null),
    },
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
  };
}

function makeControllerFactory(prisma: IPrismaMock) {
  return new ControllerFactoryAuthService(prisma as never);
}

const ctrl: IControllerSpec = {
  resource: 'policies',
  routes: [
    { path: '/', verb: 'list', operationId: 'list', authRequired: false },
    { path: '/:id', verb: 'get', operationId: 'get', authRequired: true },
  ],
};

describe('E2eRoutesSmokeAuthService.buildCases / smoke', () => {
  it('buildCases from prisma table', async () => {
    const prisma = makePrisma([{ resource: 'policies', routes: ctrl.routes }]);
    const cf = makeControllerFactory(prisma);
    const svc = new E2eRoutesSmokeAuthService(prisma as never, cf);
    const cases = await svc.buildCases();
    expect(cases.length).toBe(2);
  });
  it('buildCases filtered', async () => {
    const prisma = makePrisma([
      { resource: 'policies', routes: ctrl.routes },
      { resource: 'users', routes: [{ path: '/', verb: 'list', operationId: 'list', authRequired: false }] },
    ]);
    const cf = makeControllerFactory(prisma);
    const svc = new E2eRoutesSmokeAuthService(prisma as never, cf);
    const cases = await svc.buildCases({ resources: ['users'] });
    expect(cases.length).toBe(1);
    expect(cases[0].resource).toBe('users');
  });
  it('smoke runs', async () => {
    const prisma = makePrisma([{ resource: 'policies', routes: ctrl.routes }]);
    const cf = makeControllerFactory(prisma);
    const svc = new E2eRoutesSmokeAuthService(prisma as never, cf);
    const inv: ISmokeInvoker = {
      invokeRoute: async ({ path, token }) => {
        if (path === '/policies') return 200;
        if (path === '/policies/:id') return token ? 200 : 401;
        return 404;
      },
    };
    const report = await svc.smoke({ invoker: inv });
    expect(report.total).toBe(2);
    expect(report.passed).toBe(2);
  });
});

describe('E2eRoutesSmokeAuthService.coversAuthedRoutes / authedRoutes', () => {
  it('covers', async () => {
    const prisma = makePrisma([{ resource: 'policies', routes: ctrl.routes }]);
    const cf = makeControllerFactory(prisma);
    const svc = new E2eRoutesSmokeAuthService(prisma as never, cf);
    const cases = await svc.buildCases();
    expect(await svc.coversAuthedRoutes({ cases })).toBe(true);
  });
  it('authedRoutes count', async () => {
    const prisma = makePrisma([{ resource: 'policies', routes: ctrl.routes }]);
    const cf = makeControllerFactory(prisma);
    const svc = new E2eRoutesSmokeAuthService(prisma as never, cf);
    const authed = await svc.authedRoutes();
    expect(authed.length).toBe(1);
    expect(authed[0].operationId).toBe('get');
  });
});

describe('E2eRoutesSmokeAuthService.reportFailures / reportPassRate', () => {
  it('pass rate', () => {
    const svc = new E2eRoutesSmokeAuthService(
      makePrisma([]) as never,
      makeControllerFactory(makePrisma([]))
    );
    const report = {
      total: 4,
      passed: 3,
      failed: 1,
      durationMs: 0,
      results: [],
    };
    expect(svc.reportPassRate(report)).toBeCloseTo(0.75);
    expect(svc.reportFailures(report).length).toBe(0);
  });
});

describe('E2eRoutesSmokeAuthService.ping', () => {
  it('true', async () => {
    const prisma = makePrisma();
    const cf = makeControllerFactory(prisma);
    const svc = new E2eRoutesSmokeAuthService(prisma as never, cf);
    expect(await svc.ping()).toBe(true);
  });
});
