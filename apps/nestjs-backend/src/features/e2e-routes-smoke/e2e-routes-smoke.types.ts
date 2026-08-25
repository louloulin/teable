/**
 * E2E routes smoke — types (Stage 101).
 */

import type { CrudVerb, IRouteSpec } from '../controller-factory/controller-factory.types';

export type SmokeStatus = 'pending' | 'pass' | 'fail';

export interface IRouteSmokeCase {
  /** Stable id, used for diagnostics and persistence. */
  id: string;
  /** Resource path segment (e.g. 'risk-policies'). */
  resource: string;
  /** Operation id within the controller. */
  operationId: string;
  /** Optional bearer token override; if absent uses fixture user token. */
  token?: string;
  /** Optional expected status override (defaults depend on authRequired). */
  expectedStatus?: number;
}

export interface IRouteSmokeResult {
  id: string;
  resource: string;
  operationId: string;
  verb: CrudVerb;
  path: string;
  status: number;
  expectedStatus: number;
  passed: boolean;
  durationMs: number;
  detail?: string;
}

export interface IRouteSmokeReport {
  total: number;
  passed: number;
  failed: number;
  results: IRouteSmokeResult[];
  /** Wall-clock duration in ms. */
  durationMs: number;
}

export interface ISmokeInvoker {
  /** Issue a route-level smoke request and return the actual HTTP status. */
  invokeRoute(input: { verb: CrudVerb; path: string; token?: string }): Promise<number>;
}

export const MAX_SMOKE_CASES = 256;
export const MAX_SMOKE_RESULTS = 256;
