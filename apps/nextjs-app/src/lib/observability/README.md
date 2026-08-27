# Frontend Observability (Wave 12 — R12-T03)

Browser-side Real User Monitoring (RUM) for the teable Next.js app.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT` | no | (unset) | OTLP/HTTP collector base URL. When unset, RUM is in no-op mode. |
| `NEXT_PUBLIC_OTEL_SERVICE_NAME` | no | `teable-nextjs-app` | Service name resource attribute. |
| `NEXT_RUNTIME` | n/a | n/a | Next.js internal — `nodejs` / `edge` / `browser`. |

## What this adds

| Module | Role | Default mode (no env) | Active mode |
| --- | --- | --- | --- |
| `rum-init.ts` | Start the OpenTelemetry browser SDK | no-op | register `WebTracerProvider` + OTLP trace exporter |
| `instrumentation.ts` | Next.js `register()` hook | no-op | calls `startRUM()` exactly once |
| `web-vitals.ts` | LCP / FID / CLS / TTFB / FCP / INP | `console.debug` log | forward to OTLP |
| `error-reporter.ts` | `window.onerror` + `unhandledrejection` | `console.error` log | forward as span events |
| `fetch-instrumentation.ts` | `window.fetch` wrapper | `console.debug` log | forward to OTLP |

All five modules are **hard no-ops by default** so OSS deployments cost
nothing — no extra network traffic, no monkey-patched globals, no console
spam unless RUM is explicitly enabled.

## Wiring

`apps/nextjs-app/src/instrumentation.ts` is auto-discovered by Next.js 14+
when present in `src/`. It:

1. Preserves the Sentry registration from the root `instrumentation.ts`
   (so adding `src/instrumentation.ts` does NOT remove Sentry).
2. Calls `startRUM()` — a no-op unless the env var is set.

`useReportWebVitals` should be invoked once at the root of the app, e.g. in
`pages/_app.tsx`:

```ts
import { useReportWebVitals } from 'next/web-vitals';
import { defaultWebVitalsHandler } from '@/lib/observability/web-vitals';

export function reportWebVitals(metric: NextWebVitalsMetric) {
  defaultWebVitalsHandler(metric);
}
// then in the component: useReportWebVitals(reportWebVitals);
```

The `fetch-instrumentation.ts` and `error-reporter.ts` modules are
self-installing when imported. The recommended place is the root layout:

```ts
import '@/lib/observability/fetch-instrumentation';
import '@/lib/observability/error-reporter';
```

These imports are side-effect-only and add <1 KB to the bundle.

## Idempotency

Every module installs at most once:

- `startRUM()` — guarded by a module-level boolean
- `installErrorReporter()` — guarded by `globalThis` marker
- `installFetchInstrumentation()` — guarded by `globalThis` marker, exposes
  `uninstallFetchInstrumentation()` for cleanup paths (e.g. tests)

This matters because React 18 strict mode and Next.js route changes both
double-invoke effects in dev.

## Opting in to RUM in production

1. Install the optional OTel browser packages:

   ```bash
   pnpm -F @teable/nextjs-app add \
     @opentelemetry/api \
     @opentelemetry/sdk-trace-web \
     @opentelemetry/exporter-trace-otlp-http \
     @opentelemetry/resources
   ```

2. Set the env var:

   ```bash
   NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=https://otel-collector.example.com
   ```

3. Build and deploy. The browser will now forward traces + web vitals + fetch
   timing + JS errors to your collector.

## Privacy

This module forwards:

- Web Vitals (no PII)
- Fetch URL, method, status, duration (URL may contain record IDs — review
  your URL design if this matters)
- JS error message + stack (may contain user input — review the Sentry
  sanitisation rules if you care)

It does NOT forward cookies, localStorage, or session storage contents.
