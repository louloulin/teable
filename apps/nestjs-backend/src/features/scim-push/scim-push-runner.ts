/* eslint-disable @typescript-eslint/naming-convention */
/**
 * SCIM Push provisioning — HTTP delivery runner (R52).
 *
 * The runner is the missing glue between a persisted `delivery` row
 * and the actual outbound HTTP POST to the IdP. Pure helpers
 * (`buildRequest`, `signPayload`, `recordAttempt`) define the contract;
 * this module executes it.
 *
 * Design constraints:
 * - No NestJS dependency: importable from CLI workers and unit tests
 *   without spinning up the DI container.
 * - `fetchImpl` is injectable so the roundtrip drill test can swap in
 *   a stub; production uses the global `fetch` (undici, Node 18+).
 * - Timeouts are mandatory: an IdP that hangs must not stall the worker
 *   queue indefinitely. `AbortController` is honored by undici.
 * - HMAC verification happens on the receiver side, but the runner
 *   still validates the body is non-empty before declaring success.
 *
 * License: AGPL-3.0
 */

import { buildRequest } from './scim-push.service';
import type { IScimPushEvent, IScimPushSubscription } from './scim-push.types';

export interface IScimPushFetchLike {
  (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }): Promise<{
    status: number;
    text(): Promise<string>;
  }>;
}

export interface IScimPushRunnerOptions {
  /** Override fetch for tests. Default: global fetch (undici). */
  fetchImpl?: IScimPushFetchLike;
  /** Request timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Override wall-clock for tests. */
  now?: () => number;
}

export interface IScimPushRunnerResult {
  statusCode: number | null;
  /** Transport-level error message (timeout, DNS, refused). */
  error: string | null;
  durationMs: number;
  /** Response body (truncated to 4 KB). */
  bodyPreview: string;
}

export const DEFAULT_TIMEOUT_MS = 5_000;
export const MAX_BODY_PREVIEW_BYTES = 4_096;

/** Default fetch: global fetch (undici on Node 18+). */
const defaultFetch: IScimPushFetchLike = (input, init) =>
  fetch(input, init) as unknown as ReturnType<IScimPushFetchLike>;

/**
 * Execute one outbound delivery: build envelope → POST → measure →
 * return the runner result. Caller is responsible for persisting the
 * attempt via `ScimPushAuthService.recordAttempt`.
 */
export async function runOneDelivery(input: {
  subscription: IScimPushSubscription;
  event: IScimPushEvent;
  options?: IScimPushRunnerOptions;
}): Promise<IScimPushRunnerResult> {
  const fetchImpl = input.options?.fetchImpl ?? defaultFetch;
  const timeoutMs = input.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const now = input.options?.now ?? (() => Date.now());

  const envelope = buildRequest({
    subscription: input.subscription,
    event: input.event,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = now();

  let statusCode: number | null = null;
  let error: string | null = null;
  let bodyPreview = '';

  try {
    const resp = await fetchImpl(envelope.url, {
      method: 'POST',
      headers: envelope.headers,
      body: envelope.body,
      signal: controller.signal,
    });
    statusCode = resp.status;
    const text = await resp.text();
    bodyPreview = text.length > MAX_BODY_PREVIEW_BYTES
      ? text.slice(0, MAX_BODY_PREVIEW_BYTES)
      : text;
  } catch (err) {
    const e = err as { name?: string; message?: string };
    error = e.name === 'AbortError'
      ? `timeout after ${timeoutMs}ms`
      : (e.message ?? String(err));
  } finally {
    clearTimeout(timer);
  }

  return {
    statusCode,
    error,
    durationMs: now() - started,
    bodyPreview,
  };
}

/**
 * Validate a runner result before persisting. Returns true when the
 * result is structurally sane (statusCode in 100-599 or error non-empty).
 */
export function isValidRunnerResult(result: IScimPushRunnerResult): boolean {
  if (result.error !== null) return true;
  if (result.statusCode === null) return false;
  return result.statusCode >= 100 && result.statusCode < 600;
}

/** Test helpers for the runner. */
export const testHelpers = {
  defaultFetch,
};
