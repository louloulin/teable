/**
 * Controller factory — pure helpers spec (Stage 91).
 */

import {
  appendController,
  authedRoutes,
  buildRouteTable,
  findController,
  findRoute,
  totalRoutes,
  validateController,
  validateRoute,
} from './controller-factory.service';
import type { IControllerSpec, IRouteSpec } from './controller-factory.types';

const baseRoute = (over: Partial<IRouteSpec> = {}): IRouteSpec => ({
  path: '/',
  verb: 'list',
  operationId: 'list',
  authRequired: true,
  ...over,
});

const baseController = (over: Partial<IControllerSpec> = {}): IControllerSpec => ({
  resource: 'risk-policies',
  routes: [baseRoute({ operationId: 'listRiskPolicies', verb: 'list' })],
  ...over,
});

describe('controller-factory.validateRoute', () => {
  it('passes', () => {
    expect(validateRoute(baseRoute())).toBeNull();
  });
  it('rejects missing operationId', () => {
    expect(validateRoute(baseRoute({ operationId: '' }))).toContain('operationId');
  });
});

describe('controller-factory.validateController', () => {
  it('passes', () => {
    expect(validateController(baseController())).toBeNull();
  });
  it('rejects duplicate operationIds', () => {
    expect(
      validateController(
        baseController({
          routes: [
            baseRoute({ operationId: 'listRiskPolicies', verb: 'list' }),
            baseRoute({ operationId: 'listRiskPolicies', verb: 'get' }),
          ],
        })
      )
    ).toContain('duplicate');
  });
});

describe('controller-factory.buildRouteTable', () => {
  it('builds', () => {
    const table = buildRouteTable({ controllers: [baseController()] });
    expect(table.controllers.length).toBe(1);
  });
});

describe('controller-factory.findController', () => {
  it('found', () => {
    const table = buildRouteTable({ controllers: [baseController()] });
    expect(findController(table, 'risk-policies')?.resource).toBe('risk-policies');
  });
  it('missing', () => {
    expect(findController(buildRouteTable({ controllers: [] }), 'nope')).toBeNull();
  });
});

describe('controller-factory.findRoute', () => {
  it('found', () => {
    const table = buildRouteTable({ controllers: [baseController()] });
    const r = findRoute({ table, resource: 'risk-policies', operationId: 'listRiskPolicies' });
    expect(r?.verb).toBe('list');
  });
});

describe('controller-factory.totalRoutes', () => {
  it('sums', () => {
    const table = buildRouteTable({
      controllers: [baseController(), baseController({ resource: 'quotas' })],
    });
    expect(totalRoutes(table)).toBe(2);
  });
});

describe('controller-factory.authedRoutes', () => {
  it('filters', () => {
    const table = buildRouteTable({
      controllers: [
        baseController({
          routes: [
            baseRoute({ operationId: 'a', authRequired: true }),
            baseRoute({ operationId: 'b', authRequired: false, verb: 'get' }),
          ],
        }),
      ],
    });
    expect(authedRoutes(table).length).toBe(1);
  });
});

describe('controller-factory.appendController', () => {
  it('appends', () => {
    const table = appendController({
      table: buildRouteTable({ controllers: [] }),
      controller: baseController(),
    });
    expect(table.controllers.length).toBe(1);
  });
});
