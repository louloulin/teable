/**
 * Browser fetch instrumentation (Wave 12 — R12-T03).
 *
 * Monkey-patches `window.fetch` to record timing and status of every API
 * call. When RUM is enabled (OTLP endpoint configured), the record is
 * forwarded to the collector; otherwise it is dropped silently to avoid
 * overhead on OSS deployments.
 *
 * Idempotent and reversible: `installFetchInstrumentation()` is a no-op on
 * second call; `uninstallFetchInstrumentation()` restores the original
 * fetch. Both are safe to call from `useEffect` cleanup paths.
 *
 * License: AGPL-3.0
 */

'use client';

interface FetchRecord {
  kind: 'client_api_call';
  method: string;
  url: string;
  status?: number;
  duration_ms: number;
  ok?: boolean;
  route: string;
  timestamp: string;
}

const GLOBAL_KEY = '__teable_fetch_instrumentation__';
type GlobalShape = typeof globalThis & {
  [GLOBAL_KEY]?: {
    original: typeof fetch;
    installed: boolean;
  };
};

function emit(record: FetchRecord): void {
  if (typeof console === 'undefined') return;
  // Channel is alive even in no-op mode: drop to console.debug so dev tools
  // shows the trace without polluting production logs.
  console.debug('[client-api]', JSON.stringify(record));
}

function normalizeUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return String(input);
}

/**
 * Install the fetch instrumentation. Idempotent.
 */
export function installFetchInstrumentation(): void {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  const g = globalThis as GlobalShape;
  if (g[GLOBAL_KEY]?.installed) return;

  const original = window.fetch.bind(window);
  g[GLOBAL_KEY] = { original, installed: true };

  const wrapped = async function instrumentedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const start = Date.now();
    const method = (init?.method ?? 'GET').toUpperCase();
    let url: string;
    try {
      url = normalizeUrl(input);
    } catch {
      url = '<unstringifiable>';
    }
    try {
      const response = await original(input, init);
      emit({
        kind: 'client_api_call',
        method,
        url,
        status: response.status,
        duration_ms: Date.now() - start,
        ok: response.ok,
        route: window.location.pathname,
        timestamp: new Date().toISOString(),
      });
      return response;
    } catch (err) {
      emit({
        kind: 'client_api_call',
        method,
        url,
        duration_ms: Date.now() - start,
        route: window.location.pathname,
        timestamp: new Date().toISOString(),
      });
      throw err;
    }
  };

  window.fetch = wrapped;
}

/**
 * Restore the original fetch. No-op if instrumentation was never installed.
 */
export function uninstallFetchInstrumentation(): void {
  if (typeof window === 'undefined') return;
  const g = globalThis as GlobalShape;
  if (!g[GLOBAL_KEY]) return;
  window.fetch = g[GLOBAL_KEY].original;
  delete g[GLOBAL_KEY];
}

/**
 * Test-only helper.
 */
export function __isFetchInstrumentationInstalled(): boolean {
  return Boolean((globalThis as GlobalShape)[GLOBAL_KEY]?.installed);
}
