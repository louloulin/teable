/**
 * Supertest helper — types (Stage 99).
 */

export type HttpVerb = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface IHttpRequest {
  verb: HttpVerb;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  /** Caller-supplied trace id for correlation. */
  traceId?: string;
}

export interface IHttpResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
  durationMs: number;
  traceId: string;
}

export interface IAppInvoker {
  /** Issue a request, return the response. */
  invoke(req: IHttpRequest): Promise<IHttpResponse>;
}

export interface IHttpHeadersInput {
  /** Bearer token to inject as Authorization: Bearer <token>. */
  token?: string;
  /** Trace id; defaults to a generated UUID-ish string. */
  traceId?: string;
  /** Extra headers to merge. */
  extra?: Record<string, string>;
}

export interface IRouteHit {
  verb: HttpVerb;
  path: string;
  status: number;
  durationMs: number;
  traceId: string;
  error?: string;
}

export interface IRunSummary {
  total: number;
  passed: number;
  failed: number;
  hits: IRouteHit[];
}

export const MAX_HEADER_KEYS = 32;
export const MAX_HEADER_VALUE_LENGTH = 1024;
export const MAX_PATH_LENGTH = 512;
export const MAX_BODY_BYTES = 1_048_576;
