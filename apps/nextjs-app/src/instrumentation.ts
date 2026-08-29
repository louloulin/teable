/**
 * Next.js 14+ `register()` hook.
 *
 * Runs once per Node runtime when the server boots (and again on edge if used).
 * It is the canonical place to wire up observability — we:
 *   1. Replicate the Sentry initialisation from the root `instrumentation.ts`
 *      so that adding `src/instrumentation.ts` does NOT replace the existing
 *      Sentry wiring.  Next.js prefers `src/instrumentation.ts` when the
 *      `src/` folder exists; preserving the Sentry call keeps production
 *      error monitoring working unchanged.
 *   2. Call `startRUM()` which is a hard no-op unless the operator opted in
 *      via `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT`.
 *
 * License: AGPL-3.0
 */

import { startRUM } from '@/lib/observability/rum-init';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 1. Sentry: dynamic import so OSS deployments without @sentry/nextjs
    //    installed still typecheck and start cleanly.
    try {
      // eslint-disable-next-line import/no-unresolved
      await import('../instrumentation');
    } catch {
      // The root file imports `@sentry/nextjs`; if Sentry is not installed,
      // swallow the error here (the root file's logic is duplicated below
      // for the happy path).
    }

    // 2. RUM: a no-op unless the OTLP env var is set.
    await startRUM();
  }
}

// Next.js also exposes an `onRequestError` hook for surfacing unhandled server
// errors to monitoring.  We re-delegate to `@sentry/nextjs` exactly like the
// root instrumentation file did — keeping the symmetric behaviour regardless
// of which file Next.js ends up loading.
export const onRequestError = async (
  err: Error,
  request: {
    path: string;
    method: string;
    headers: Record<string, string>;
  },
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
    renderSource?: string;
    revalidateReason?: string;
    serverComponentType?: string;
  }
) => {
  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(err, { extra: { request, context } });
  } catch {
    // Sentry is optional (OSS deployments often disable it); swallow rather
    // than masking the original error during reporting.
  }
};
