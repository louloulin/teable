/**
 * Supertest helper — pure helpers (Stage 99).
 */

import type {
  HttpVerb,
  IAppInvoker,
  IHttpHeadersInput,
  IHttpRequest,
  IHttpResponse,
  IRouteHit,
  IRunSummary,
} from './supertest-helper.types';
import {
  MAX_HEADER_KEYS,
  MAX_HEADER_VALUE_LENGTH,
  MAX_PATH_LENGTH,
} from './supertest-helper.types';

const VERBS: ReadonlyArray<HttpVerb> = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Generate a stable trace id when caller does not provide one. */
export function newTraceId(seed?: string): string {
  const now = Date.now().toString(36);
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  return seed ? `${seed}-${now}-${rand}` : `trace-${now}-${rand}`;
}

/** Validate an HTTP request before dispatching. */
export function validateRequest(req: IHttpRequest): string | null {
  if (!VERBS.includes(req.verb)) return `unknown verb: ${req.verb}`;
  if (!req.path) return 'path required';
  if (req.path.length > MAX_PATH_LENGTH) return `path too long (${MAX_PATH_LENGTH})`;
  if (!req.path.startsWith('/')) return `path must start with /`;
  const headerCount = Object.keys(req.headers).length;
  if (headerCount > MAX_HEADER_KEYS) return `too many headers (${MAX_HEADER_KEYS})`;
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v !== 'string') return `header ${k} not string`;
    if (v.length > MAX_HEADER_VALUE_LENGTH) return `header ${k} too long`;
  }
  return null;
}

/** Build headers from an optional token + trace + extra headers. */
export function buildHeaders(input: IHttpHeadersInput = {}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (input.token) headers['authorization'] = `Bearer ${input.token}`;
  const tid = input.traceId ?? newTraceId();
  headers['x-trace-id'] = tid;
  headers['content-type'] = 'application/json';
  if (input.extra) {
    for (const [k, v] of Object.entries(input.extra)) {
      if (Object.keys(headers).length >= MAX_HEADER_KEYS) break;
      headers[k.toLowerCase()] = String(v);
    }
  }
  return headers;
}

/** Build an assertion path for expect-style diagnostics. */
export function buildAssertionPath(input: {
  verb: HttpVerb;
  path: string;
  traceId: string;
}): string {
  return `${input.verb} ${input.path} [trace=${input.traceId}]`;
}

/** Run a single request against an IAppInvoker. */
export async function runRequest(input: {
  invoker: IAppInvoker;
  req: IHttpRequest;
}): Promise<IHttpResponse> {
  const err = validateRequest(input.req);
  if (err) throw new Error(`invalid request: ${err}`);
  return input.invoker.invoke(input.req);
}

/** Run a list of requests sequentially, accumulating hits. */
export async function runSequence(input: {
  invoker: IAppInvoker;
  requests: ReadonlyArray<IHttpRequest>;
}): Promise<IRunSummary> {
  const hits: IRouteHit[] = [];
  let passed = 0;
  let failed = 0;
  for (const req of input.requests) {
    const tid = req.traceId ?? newTraceId();
    try {
      const res = await runRequest({ invoker: input.invoker, req: { ...req, traceId: tid } });
      hits.push({
        verb: req.verb,
        path: req.path,
        status: res.status,
        durationMs: res.durationMs,
        traceId: res.traceId,
      });
      if (res.status >= 200 && res.status < 400) passed++;
      else failed++;
    } catch (e) {
      hits.push({
        verb: req.verb,
        path: req.path,
        status: 0,
        durationMs: 0,
        traceId: tid,
        error: e instanceof Error ? e.message : 'unknown',
      });
      failed++;
    }
  }
  return { total: input.requests.length, passed, failed, hits };
}

/** Decide pass/fail given a list of expected statuses. */
export function isExpectedStatus(actual: number, expected: ReadonlyArray<number>): boolean {
  return expected.includes(actual);
}

/** Decide whether a request is auth-bearer. */
export function isBearerAuth(headers: Record<string, string>): boolean {
  const v = headers['authorization'] ?? headers['Authorization'];
  return typeof v === 'string' && v.toLowerCase().startsWith('bearer ');
}

/** Count hits that match a target status. */
export function countByStatus(hits: ReadonlyArray<IRouteHit>, status: number): number {
  return hits.filter((h) => h.status === status).length;
}
