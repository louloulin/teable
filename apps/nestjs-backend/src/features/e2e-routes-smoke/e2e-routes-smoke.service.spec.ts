/**
 * E2E routes smoke — pure helpers spec (Stage 101).
 */

import { buildRouteTable } from '../controller-factory/controller-factory.service';
import type {
  IControllerSpec,
  IRouteSpec,
  IRouteTable,
} from '../controller-factory/controller-factory.types';
import {
  buildSmokePath,
  capCases,
  coversAuthedRoutes,
  crudVerbToHttp,
  expandControllerToCases,
  expectedStatusFor,
  failures,
  passRate,
  resolveRoute,
  runRouteSmoke,
  validateSmokeCase,
} from './e2e-routes-smoke.service';
import type {
  IRouteSmokeCase,
  ISmokeInvoker,
} from './e2e-routes-smoke.types';

const route = (over: Partial<IRouteSpec> = {}): IRouteSpec => ({
  path: '/',
  verb: 'list',
  operationId: 'list',
  authRequired: false,
  ...over,
});

const table = (controllers: IControllerSpec[]): IRouteTable => buildRouteTable({ controllers });

function makeInvoker(map: Record<string, number>): ISmokeInvoker {
  return {
    invokeRoute: async ({ path, token }) => {
      const key = `${path}|${token ?? ''}`;
      if (key in map) return map[key];
      return 200;
    },
  };
}

describe('e2e-routes-smoke.validateSmokeCase', () => {
  it('passes', () => {
    expect(validateSmokeCase({ id: 'a', resource: 'r', operationId: 'o' })).toBeNull();
  });
  it('rejects empty id', () => {
    expect(validateSmokeCase({ id: '', resource: 'r', operationId: 'o' })).toContain('id');
  });
  it('rejects expectedStatus out of range', () => {
    expect(
      validateSmokeCase({ id: 'a', resource: 'r', operationId: 'o', expectedStatus: 99 })
    ).toContain('expectedStatus');
  });
});

describe('e2e-routes-smoke.expectedStatusFor', () => {
  it('non-authed → 200', () => {
    expect(expectedStatusFor({ route: route(), hasToken: false })).toBe(200);
  });
  it('authed + token → 200', () => {
    expect(expectedStatusFor({ route: route({ authRequired: true }), hasToken: true })).toBe(200);
  });
  it('authed + no token → 401', () => {
    expect(expectedStatusFor({ route: route({ authRequired: true }), hasToken: false })).toBe(401);
  });
});

describe('e2e-routes-smoke.crudVerbToHttp / buildSmokePath', () => {
  it('crud verb map', () => {
    expect(crudVerbToHttp('list')).toBe('GET');
    expect(crudVerbToHttp('create')).toBe('POST');
    expect(crudVerbToHttp('update')).toBe('PUT');
    expect(crudVerbToHttp('delete')).toBe('DELETE');
  });
  it('path index', () => {
    expect(buildSmokePath({ resource: 'x', path: '/' })).toBe('/x');
  });
  it('path nested', () => {
    expect(buildSmokePath({ resource: 'x', path: '/:id' })).toBe('/x/:id');
  });
  it('path relative', () => {
    expect(buildSmokePath({ resource: 'x', path: 'foo' })).toBe('/x/foo');
  });
});

describe('e2e-routes-smoke.resolveRoute / expandControllerToCases / capCases', () => {
  const t = table([
    {
      resource: 'policies',
      routes: [
        route({ operationId: 'list' }),
        route({ operationId: 'get', path: '/:id', authRequired: true }),
      ],
    },
  ]);
  it('resolveRoute found', () => {
    const r = resolveRoute({ table: t, smoke: { id: 'x', resource: 'policies', operationId: 'get' } });
    expect(r?.path).toBe('/:id');
  });
  it('resolveRoute missing', () => {
    expect(resolveRoute({ table: t, smoke: { id: 'x', resource: 'policies', operationId: 'nope' } })).toBeNull();
    expect(resolveRoute({ table: t, smoke: { id: 'x', resource: 'nope', operationId: 'x' } })).toBeNull();
  });
  it('expandControllerToCases', () => {
    const cases = expandControllerToCases({
      controller: t.controllers[0],
      token: 'tok',
    });
    expect(cases.length).toBe(2);
    expect(cases[0].token).toBe('tok');
  });
  it('capCases passes when under', () => {
    const cs = [{ id: 'a', resource: 'r', operationId: 'o' }];
    expect(capCases(cs).length).toBe(1);
  });
});

describe('e2e-routes-smoke.runRouteSmoke', () => {
  it('all pass', async () => {
    const t = table([
      {
        resource: 'policies',
        routes: [route({ operationId: 'list' })],
      },
    ]);
    const cases = expandControllerToCases({ controller: t.controllers[0] });
    const inv = makeInvoker({ '/policies|': 200 });
    const report = await runRouteSmoke({ table: t, cases, invoker: inv });
    expect(report.total).toBe(1);
    expect(report.passed).toBe(1);
  });
  it('mixed auth (no token)', async () => {
    const t = table([
      {
        resource: 'policies',
        routes: [
          route({ operationId: 'list' }),
          route({ operationId: 'get', path: '/:id', authRequired: true }),
        ],
      },
    ]);
    const cases = expandControllerToCases({ controller: t.controllers[0] });
    const inv = makeInvoker({ '/policies|': 200, '/policies/:id|': 401 });
    const report = await runRouteSmoke({ table: t, cases, invoker: inv });
    expect(report.total).toBe(2);
    expect(report.passed).toBe(2);
  });
  it('records failures', async () => {
    const t = table([
      {
        resource: 'policies',
        routes: [route({ operationId: 'list' })],
      },
    ]);
    const cases = expandControllerToCases({ controller: t.controllers[0] });
    const inv = makeInvoker({ '/policies|': 500 });
    const report = await runRouteSmoke({ table: t, cases, invoker: inv });
    expect(failures(report).length).toBe(1);
    expect(passRate(report)).toBe(0);
  });
  it('catches invoker errors', async () => {
    const t = table([
      {
        resource: 'policies',
        routes: [route({ operationId: 'list' })],
      },
    ]);
    const cases = expandControllerToCases({ controller: t.controllers[0] });
    const inv: ISmokeInvoker = {
      invokeRoute: () => Promise.reject(new Error('boom')),
    };
    const report = await runRouteSmoke({ table: t, cases, invoker: inv });
    expect(report.failed).toBe(1);
    expect(failures(report)[0].detail).toBe('boom');
  });
  it('unknown resource → result with detail', async () => {
    const t = table([]);
    const cases: IRouteSmokeCase[] = [{ id: 'a', resource: 'x', operationId: 'y' }];
    const report = await runRouteSmoke({ table: t, cases, invoker: makeInvoker({}) });
    expect(report.failed).toBe(1);
    expect(failures(report)[0].detail).toBe('route not found');
  });
  it('invalid case shape → result with detail', async () => {
    const t = table([]);
    const cases = [{ id: '', resource: '', operationId: '' } as IRouteSmokeCase];
    const report = await runRouteSmoke({ table: t, cases, invoker: makeInvoker({}) });
    expect(report.failed).toBe(1);
  });
});

describe('e2e-routes-smoke.coversAuthedRoutes', () => {
  it('covers all', () => {
    const t = table([
      {
        resource: 'p',
        routes: [route({ operationId: 'list' }), route({ operationId: 'get', authRequired: true, path: '/:id' })],
      },
    ]);
    const cases = expandControllerToCases({ controller: t.controllers[0] });
    expect(coversAuthedRoutes({ table: t, cases })).toBe(true);
  });
  it('missing', () => {
    const t = table([
      {
        resource: 'p',
        routes: [
          route({ operationId: 'list' }),
          route({ operationId: 'a', authRequired: true, path: '/a' }),
          route({ operationId: 'b', authRequired: true, path: '/b' }),
        ],
      },
    ]);
    const cases: IRouteSmokeCase[] = [{ id: '1', resource: 'p', operationId: 'a' }];
    expect(coversAuthedRoutes({ table: t, cases })).toBe(false);
  });
});
