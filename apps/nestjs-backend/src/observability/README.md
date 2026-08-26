# Backend Observability (Wave 12 — R12-T01)

Production-grade OpenTelemetry tracing + Prometheus metrics for the
teable-nestjs-backend service.

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | no | (unset) | OTLP/HTTP collector base URL. When unset, tracing is in no-op mode. |
| `OTEL_SERVICE_NAME` | no | `teable-nestjs-backend` | Service name attribute on every span / metric. |
| `DEPLOYMENT_ENVIRONMENT` | no | `NODE_ENV` or `development` | `deployment.environment.name` resource attribute. |
| `PR_BUILD_VERSION` | no | `unknown` | `service.version` resource attribute (set by CI). |

## Endpoints

| Endpoint | Auth | Format | Description |
| --- | --- | --- | --- |
| `GET /metrics` | none | `text/plain; version=0.0.4` | Prometheus scrape target |

> The `/metrics` endpoint is intentionally not gated by application auth so
> Prometheus can scrape it directly. In production:
>
> 1. Restrict access at the network layer (allowlist the Prometheus IP), OR
> 2. Front the endpoint with a sidecar that injects basic-auth, OR
> 3. Run Prometheus with mTLS against the backend.
>
> See `SLO.md` (Wave 12 second-batch) for the scrape config.

## Modes

**Active mode** — `OTEL_EXPORTER_OTLP_ENDPOINT` is set:

- NodeSDK starts on `bootstrap.ts` import
- OTLP trace exporter pushes spans to `${endpoint}/v1/traces`
- Auto-instrumentations for HTTP, Express, NestJS, pg, Pino, Redis, runtime-node
- `fs` instrumentation disabled (too noisy for SLO work)
- Resource attributes: `service.name`, `service.version`, `deployment.environment.name`

**No-op mode** — endpoint unset:

- Single warning logged at startup
- `initTracing()` returns a no-op shutdown handle so the call site stays uniform
- `/metrics` still works (Prometheus never depended on tracing)
- `tracingHandle.shutdown()` resolves immediately on SIGTERM / SIGINT

## What gets instrumented

Auto-instrumentations active in both modes:

- HTTP server (incoming requests)
- Express middleware
- NestJS core (interceptors, guards, pipes)
- PostgreSQL via pg driver
- Pino structured logs
- ioredis (Redis client)
- Node.js runtime (event loop lag, GC, CPU)

Domain metrics emitted via helpers (see `metric-recorder.ts`):

- HTTP request duration / status counts (via `http-duration.interceptor.ts`)
- Prisma query duration / counts (via `db-duration.interceptor.ts`)
- Webhook delivery outcomes / retries (via `webhook-metrics.ts`)
- AI request outcomes / token usage (via `ai-metrics.ts`)
- Automation run outcomes (via `automation-metrics.ts`)

See `METRICS.md` for the full catalog with PromQL examples.

## Tracing is started exactly once

`initTracing()` is idempotent — second invocation returns the existing handle
without starting another SDK. State is cached on `globalThis` so HMR
(webpack hot reload) does not accumulate SDK instances during local dev.

## Shutdown

`bootstrap.ts` registers `SIGTERM` and `SIGINT` handlers that call
`tracingHandle.shutdown()`. The handle is idempotent: double-shutdown is a
no-op. This flushes pending spans before the process exits.

## Production deployment

1. Deploy an OTLP collector (e.g. OpenTelemetry Collector, Vector, Grafana Agent)
2. Set `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318` in backend env
3. Configure Prometheus to scrape `http://<backend>:3000/metrics` every 15s
4. Verify spans show up in Tempo / Jaeger / Honeycomb
5. Verify metrics show up in Prometheus: `up{job="teable-backend"} == 1`

## Testing locally without a collector

Default mode is no-op. Just don't set `OTEL_EXPORTER_OTLP_ENDPOINT` and the
backend starts cleanly with metrics-only observability.

To exercise the active path locally:

```bash
docker run -d --name otel-collector -p 4318:4318 -p 4317:4317 \
  -v $PWD/otel-collector.yaml:/etc/otelcol/config.yaml \
  otel/opentelemetry-collector-contrib:latest

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 \
  pnpm -F @teable/backend dev
```
