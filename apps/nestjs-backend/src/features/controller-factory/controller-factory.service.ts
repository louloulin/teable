/**
 * Controller factory — pure helpers (Stage 91).
 */

import type {
  CrudVerb,
  IControllerSpec,
  IRouteSpec,
  IRouteTable,
} from './controller-factory.types';
import {
  MAX_CONTROLLERS,
  MAX_ROUTES_PER_CONTROLLER,
} from './controller-factory.types';

const VERBS: ReadonlyArray<CrudVerb> = ['list', 'get', 'create', 'update', 'delete', 'custom'];

/** Validate a route spec. */
export function validateRoute(r: IRouteSpec): string | null {
  if (!r.path && r.path !== '/') return 'path required';
  if (!VERBS.includes(r.verb)) return `unknown verb: ${r.verb}`;
  if (!r.operationId) return 'operationId required';
  return null;
}

/** Validate a controller spec. */
export function validateController(c: IControllerSpec): string | null {
  if (!c.resource) return 'resource required';
  if (!Array.isArray(c.routes)) return 'routes must be an array';
  if (c.routes.length > MAX_ROUTES_PER_CONTROLLER) return `routes cap ${MAX_ROUTES_PER_CONTROLLER}`;
  const seen = new Set<string>();
  for (const r of c.routes) {
    if (seen.has(r.operationId)) return `duplicate operationId: ${r.operationId}`;
    seen.add(r.operationId);
    const err = validateRoute(r);
    if (err) return err;
  }
  return null;
}

/** Build a routing table from controller specs. */
export function buildRouteTable(input: { controllers: ReadonlyArray<IControllerSpec> }): IRouteTable {
  const controllers = input.controllers.slice(-MAX_CONTROLLERS);
  for (const c of controllers) {
    const err = validateController(c);
    if (err) throw new Error(`invalid controller ${c.resource}: ${err}`);
  }
  return { controllers };
}

/** Find a controller by resource. */
export function findController(table: IRouteTable, resource: string): IControllerSpec | null {
  return table.controllers.find((c) => c.resource === resource) ?? null;
}

/** Find a route within a controller. */
export function findRoute(input: {
  table: IRouteTable;
  resource: string;
  operationId: string;
}): IRouteSpec | null {
  const c = findController(input.table, input.resource);
  if (!c) return null;
  return c.routes.find((r) => r.operationId === input.operationId) ?? null;
}

/** Total route count across the table. */
export function totalRoutes(table: IRouteTable): number {
  return table.controllers.reduce((acc, c) => acc + c.routes.length, 0);
}

/** List routes that require authentication. */
export function authedRoutes(table: IRouteTable): IRouteSpec[] {
  const out: IRouteSpec[] = [];
  for (const c of table.controllers) {
    for (const r of c.routes) {
      if (r.authRequired) out.push(r);
    }
  }
  return out;
}

/** Append a controller, capped. */
export function appendController(input: {
  table: IRouteTable;
  controller: IControllerSpec;
}): IRouteTable {
  return buildRouteTable({ controllers: [...input.table.controllers, input.controller] });
}
