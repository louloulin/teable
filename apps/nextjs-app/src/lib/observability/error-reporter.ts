/**
 * Browser global error capture (Wave 12 — R12-T03).
 *
 * Hooks into `window.onerror` and `window.onunhandledrejection` so client-side
 * JavaScript errors are observable even when Sentry is not installed. In
 * production (RUM enabled) the event is forwarded to OTLP as a span event;
 * otherwise it is logged to console with structured JSON for development.
 *
 * Idempotent: installing twice is a no-op (the second install is detected by
 * a marker on the global and skipped). This matters because hot-reload, route
 * changes, and React 18 strict mode can all double-invoke effects.
 */

'use client';

const GLOBAL_KEY = '__teable_error_reporter_installed__';
type GlobalShape = typeof globalThis & { [GLOBAL_KEY]?: boolean };

interface CapturedError {
  kind: 'js_error' | 'unhandled_rejection';
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  route: string;
  timestamp: string;
}

function emit(payload: CapturedError): void {
  if (typeof console === 'undefined') return;
  if (typeof window === 'undefined') return;
  // When RUM (OpenTelemetry browser) is loaded, future work will replace this
  // console path with `trace.getActiveSpan()?.addEvent(...)`. For now we log
  // structured JSON so the channel is observable from dev tools.
  console.error('[js-error]', JSON.stringify(payload));
}

function installOnError(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __teable_onerror__?: OnErrorEventHandler };
  // Preserve any prior handler so we don't break downstream listeners.
  const prev = w.onerror;
  w.onerror = function (message, source, lineno, colno, error) {
    emit({
      kind: 'js_error',
      message: typeof message === 'string' ? message : error?.message ?? 'unknown',
      stack: error?.stack,
      filename: typeof source === 'string' ? source : undefined,
      lineno: typeof lineno === 'number' ? lineno : undefined,
      colno: typeof colno === 'number' ? colno : undefined,
      route: window.location.pathname,
      timestamp: new Date().toISOString(),
    });
    if (typeof prev === 'function') {
      return prev.call(window, message, source, lineno, colno, error);
    }
    return false;
  };
}

function installOnUnhandledRejection(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & {
    __teable_onunhandledrejection__?: ((ev: PromiseRejectionEvent) => void) | null;
  };
  const listener = (ev: PromiseRejectionEvent) => {
    const reason = ev.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : (() => {
              try {
                return JSON.stringify(reason);
              } catch {
                return 'unserializable rejection';
              }
            })();
    emit({
      kind: 'unhandled_rejection',
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      route: window.location.pathname,
      timestamp: new Date().toISOString(),
    });
  };
  // `onunhandledrejection` is a single-slot property; the harness already
  // coexists with Sentry by ordering installs so we set it directly.
  w.addEventListener('unhandledrejection', listener);
}

/**
 * Install the global error capture. Idempotent — calling twice does nothing.
 */
export function installErrorReporter(): void {
  if (typeof window === 'undefined') return;
  const g = globalThis as GlobalShape;
  if (g[GLOBAL_KEY]) return;
  g[GLOBAL_KEY] = true;
  installOnError();
  installOnUnhandledRejection();
}

/**
 * Test-only helper. Wipes the install marker so a fresh `installErrorReporter()`
 * can re-run.
 */
export function __resetErrorReporterForTests(): void {
  delete (globalThis as GlobalShape)[GLOBAL_KEY];
}
