/**
 * E2E routes smoke — pure helpers (Stage 101).
 */

import {
  authedRoutes,
  validateController,
} from '../controller-factory/controller-factory.service';
import type { CrudVerb, IControllerSpec, IRouteSpec, IRouteTable } from '../controller-factory/controller-factory.types';
import type {
  IRouteSmokeCase,
  IRouteSmokeReport,
  IRouteSmokeResult,
  ISmokeInvoker,
} from './e2e-routes-smoke.types';
import { MAX_SMOKE_CASES } from './e2e-routes-smoke.types';

const VERB_TO_HTTP: Record<CrudVerb, 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'> = {
  list: 'GET',
  get: 'GET',
  create: 'POST',
  update: 'PUT',
  delete: 'DELETE',
  custom: 'POST',
};

/** Validate a smoke case shape. */
export function validateSmokeCase(c: IRouteSmokeCase): string | null {
  if (!c.id) return 'id required';
  if (!c.resource) return 'resource required';
  if (!c.operationId) return 'operationId required';
  if (c.expectedStatus !== undefined && (c.expectedStatus < 100 || c.expectedStatus > 599)) {
    return 'expectedStatus out of range';
  }
  return null;
}

/** Compute the expected HTTP status for a route. */
export function expectedStatusFor(input: {
  route: IRouteSpec;
  hasToken: boolean;
}): number {
  if (input.expectedStatus) return input.expectedStatus;
  if (!input.route.authRequired) return 200;
  return input.hasToken ? 200 : 401;
}

/** Map CRUD verb to HTTP verb. */
export function crudVerbToHttp(v: CrudVerb): 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' {
  return VERB_TO_HTTP[v];
}

/** Build the absolute HTTP path for a route. */
export function buildSmokePath(input: {
  resource: string;
  path: string;
}): string {
  const base = `/${input.resource}`;
  if (!input.path || input.path === '/') return base;
  if (input.path.startsWith('/')) return `${base}${input.path}`;
  return `${base}/${input.path}`;
}

/** Resolve a smoke case to its route spec. */
export function resolveRoute(input: {
  table: IRouteTable;
  smoke: IRouteSmokeCase;
}): IRouteSpec | null {
  const c = input.table.controllers.find((x) => x.resource === input.smoke.resource);
  if (!c) return null;
  return c.routes.find((r) => r.operationId === input.smoke.operationId) ?? null;
}

/** Expand a controller spec into smoke cases (one per route). */
export function expandControllerToCases(input: {
  controller: IControllerSpec;
  token?: string;
}): IRouteSmokeCase[] {
  const err = validateController(input.controller);
  if (err) throw new Error(`invalid controller: ${err}`);
  return input.controller.routes.map((r) => ({
    id: `${input.controller.resource}:${r.operationId}`,
    resource: input.controller.resource,
    operationId: r.operationId,
    token: input.token,
    expectedStatus: undefined,
  }));
}

/** Cap the case list. */
export function capCases(cases: ReadonlyArray<IRouteSmokeCase>): IRouteSmokeCase[] {
  if (cases.length <= MAX_SMOKE_CASES) return cases.slice();
  return cases.slice(0, MAX_SMOKE_CASES);
}

/** Run smoke cases sequentially against an invoker. */
export async function runRouteSmoke(input: {
  table: IRouteTable;
  cases: ReadonlyArray<IRouteSmokeCase>;
  invoker: ISmokeInvoker;
  now?: () => number;
}): Promise<IRouteSmokeReport> {
  const started = (input.now ?? Date.now)();
  const results: IRouteSmokeResult[] = [];
  for (const c of input.cases) {
    const err = validateSmokeCase(c);
    if (err) {
      results.push({
        id: c.id,
        resource: c.resource,
        operationId: c.operationId,
        verb: 'custom',
        path: '',
        status: 0,
        expectedStatus: c.expectedStatus ?? 0,
        passed: false,
        durationMs: 0,
        detail: err,
      });
      continue;
    }
    const route = resolveRoute({ table: input.table, smoke: c });
    if (!route) {
      results.push({
        id: c.id,
        resource: c.resource,
        operationId: c.operationId,
        verb: 'custom',
        path: '',
        status: 0,
        expectedStatus: c.expectedStatus ?? 0,
        passed: false,
        durationMs: 0,
        detail: 'route not found',
      });
      continue;
    }
    const path = buildSmokePath({ resource: c.resource, path: route.path });
    const expected = expectedStatusFor({
      route,
      hasToken: Boolean(c.token),
      expectedStatus: c.expectedStatus,
    } as never);
    const expected2 = c.expectedStatus ?? expected;
    const t0 = (input.now ?? Date.now)();
    let status = 0;
    let detail: string | undefined;
    try {
      status = await input.invoker.invokeRoute({
        verb: route.verb,
        path,
        token: c.token,
      });
    } catch (e) {
      detail = e instanceof Error ? e.message : 'unknown';
    }
    const dur = (input.now ?? Date.now)() - t0;
    results.push({
      id: c.id,
      resource: c.resource,
      operationId: c.operationId,
      verb: route.verb,
      path,
      status,
      expectedStatus: expected2,
      passed: status === expected2,
      durationMs: dur,
      detail,
    });
  }
  const finished = (input.now ?? Date.now)();
  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
    durationMs: finished - started,
  };
}

/** Filter results to failures only. */
export function failures(report: IRouteSmokeReport): IRouteSmokeResult[] {
  return report.results.filter((r) => !r.passed);
}

/** Pass rate for a smoke report. */
export function passRate(report: IRouteSmokeReport): number {
  if (report.total === 0) return 1;
  return report.passed / report.total;
}

/** Whether every authed route was exercised. */
export function coversAuthedRoutes(input: {
  table: IRouteTable;
  cases: ReadonlyArray<IRouteSmokeCase>;
}): boolean {
  const authed = new Set(authedRoutes(input.table).map((r) => `${r.path}|${r.operationId}`));
  for (const c of input.cases) {
    const route = resolveRoute({ table: input.table, smoke: c });
    if (!route) continue;
    if (route.authRequired) authed.delete(`${route.path}|${route.operationId}`);
  }
  return authed.size === 0;
}
