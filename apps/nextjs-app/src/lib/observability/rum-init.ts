/**
 * Browser-side RUM (Real User Monitoring) initializer.
 *
 * Activated ONLY when `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT` is set; in that
 * mode it configures the OpenTelemetry Browser SDK with an OTLP/HTTP exporter
 * pointed at the operator's collector. When the env var is absent (default for
 * OSS builds and dev) this module is a hard no-op so existing pages cost
 * nothing — same shape as the Sentry setup next to it.
 *
 * Why "next-style" dynamic import:
 *   The OTel browser packages are heavyweight and not part of the default
 *   dependency tree; we lazy-load them, swallow the failure (e.g. someone ran
 *   the build without installing them) and surface a single warn. Production
 *   deployments that want RUM must install the packages and set the env var.
 *
 * License: AGPL-3.0
 */

// Why keep an extra boolean guard instead of `||=`?  `startRUM` can be invoked
// from both the server instrumentation hook (where there is no window) and the
// client bundle (where OTel must be set up exactly once).  We want the same
// idempotency across both surfaces.
let rumStarted = false;

const ENV_KEY = 'NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT';

/**
 * Returns the configured OTLP endpoint when RUM is enabled, otherwise undefined.
 * Safe to call on the server (reads `process.env`) and on the client
 * (inlined by Next.js because of the `NEXT_PUBLIC_` prefix).
 */
export function getRumEndpoint(): string | undefined {
  // `process` exists on both Node and in the Next.js client bundle, but the
  // shape differs at the edges — guard instead of importing `@types/node`.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  return env?.[ENV_KEY];
}

export function isRumEnabled(): boolean {
  return Boolean(getRumEndpoint());
}

/**
 * Minimal OTel surface used at runtime.  Typed as `any` because the packages
 * are dynamically imported and may not be installed; the OTEL_TYPES comment
 * points to the declared shape in `./otel-types.d.ts` which keeps editor
 * tooling useful without forcing a `package.json` dep on every contributor.
 *
 * @see ./otel-types.d.ts
 */
type OtelApi = {
  context: unknown;
  BatchSpanProcessor: new (exporter: unknown) => unknown;
  W3CTraceContextPropagator: new () => unknown;
};

type OtelSdk = {
  WebTracerProvider: new (config: {
    resource: unknown;
    spanProcessors: unknown[];
  }) => {
    register: (config: { context: unknown; propagator: unknown }) => void;
  };
};

type OtelExporter = {
  OTLPTraceExporter: new (config: { url: string }) => unknown;
};

type OtelResources = {
  Resource: new (attrs: Record<string, string>) => unknown;
};

/**
 * Configure browser RUM.  Idempotent.  Returns:
 *   - `true`  when OTel was successfully configured in this call;
 *   - `false` when the configuration was skipped (no env / not browser / dep
 *             load failed / already initialised).
 *
 * The boolean lets callers (and the test suite) assert which path ran without
 * having to mock module internals.
 */
export async function startRUM(): Promise<boolean> {
  if (rumStarted) return false;

  const endpoint = getRumEndpoint();
  if (!endpoint) {
    return false;
  }

  // RUM is browser-only; the server-side `register()` also calls this so the
  // module stays the single source of truth for env gating.
  if (typeof window === 'undefined') {
    return false;
  }

  // OPT-1: load the OTel browser packages on demand.  If they are absent (i.e.
  // an OSS deployment that never opted in), we degrade to console.warn so the
  // page still works for end-users.
  let apiMod: OtelApi | null = null;
  let sdkMod: OtelSdk | null = null;
  let exporterMod: OtelExporter | null = null;
  let resourcesMod: OtelResources | null = null;

  try {
    // `as unknown as ...` because the @opentelemetry/* browser packages are
    // optional peer-style deps — see `apps/nextjs-app/package.json` notes for
    // which exact versions to install when this code path goes live.
    apiMod = (await import(/* webpackIgnore: true */ '@opentelemetry/api')) as unknown as OtelApi;
    sdkMod = (await import(/* webpackIgnore: true */ '@opentelemetry/sdk-trace-web')) as unknown as OtelSdk;
    exporterMod = (await import(/* webpackIgnore: true */ '@opentelemetry/exporter-trace-otlp-http')) as unknown as OtelExporter;
    resourcesMod = (await import(/* webpackIgnore: true */ '@opentelemetry/resources')) as unknown as OtelResources;
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn(
        '[observability] OTel browser packages are not installed; install @opentelemetry/{api,sdk-trace-web,exporter-trace-otlp-http,resources,semantic-conventions} to enable RUM.',
        err
      );
    }
    return false;
  }

  if (!apiMod || !sdkMod || !exporterMod || !resourcesMod) {
    return false;
  }

  try {
    const otlp = new exporterMod.OTLPTraceExporter({ url: endpoint });
    const provider = new sdkMod.WebTracerProvider({
      resource: new resourcesMod.Resource({
        'service.name': 'teable-nextjs-app',
        'service.version': (globalThis as { process?: { env?: Record<string, string | undefined> } })
          .process?.env?.APP_VERSION ?? 'develop',
      }),
      spanProcessors: [new apiMod.BatchSpanProcessor(otlp)],
    });

    provider.register({
      context: apiMod.context,
      propagator: new apiMod.W3CTraceContextPropagator(),
    });

    rumStarted = true;
    return true;
  } catch (err) {
    if (typeof console !== 'undefined') {
      console.warn('[observability] failed to start RUM:', err);
    }
    return false;
  }
}

/** Test-only reset.  Never call from app code. */
export function __resetRumForTests(): void {
  rumStarted = false;
}
