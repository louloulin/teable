# Metrics Catalog

Production-grade Prometheus metrics for teable OSS. All metric names follow
Prometheus conventions (snake_case, base units, `_total` suffix for counters).

## Core HTTP / Server

| Name | Type | Labels | Unit | Description |
| --- | --- | --- | --- | --- |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status_code` | seconds | End-to-end HTTP latency per request |
| `http_requests_total` | Counter | `method`, `route`, `status_class` | — | Total HTTP responses (success / client error / server error) |
| `nodejs_eventloop_lag_seconds` | Histogram | — | seconds | Event loop lag (default node metrics) |
| `nodejs_heap_size_total_bytes` | Gauge | — | bytes | V8 heap total |
| `process_cpu_seconds_total` | Counter | — | seconds | Process CPU time |
| `process_resident_memory_bytes` | Gauge | — | bytes | RSS |

## Database (Prisma)

| Name | Type | Labels | Unit | Description |
| --- | --- | --- | --- | --- |
| `db_query_duration_seconds` | Histogram | `operation`, `table` | seconds | Prisma query wall-clock time |
| `db_queries_total` | Counter | `operation`, `table`, `outcome` | — | Query count by success / failure |

## Webhooks

| Name | Type | Labels | Unit | Description |
| --- | --- | --- | --- | --- |
| `webhook_delivery_total` | Counter | `outcome`, `webhook_id` | — | Webhook delivery outcomes (`success` / `failed` / `dead_letter`) |
| `webhook_delivery_duration_seconds` | Histogram | `outcome`, `webhook_id` | seconds | End-to-end delivery time (resolve + send + ack) |
| `webhook_retry_total` | Counter | `outcome`, `attempt` | — | Retry attempts before success / dead-letter |

## AI

| Name | Type | Labels | Unit | Description |
| --- | --- | --- | --- | --- |
| `ai_requests_total` | Counter | `model`, `action`, `outcome` | — | AI requests by model and action (`success` / `failed` / `rate_limited`) |
| `ai_request_duration_seconds` | Histogram | `model`, `action` | seconds | AI request latency |
| `ai_tokens_total` | Counter | `model`, `direction` | tokens | Prompt vs completion token usage (`prompt` / `completion`) |

## Automation

| Name | Type | Labels | Unit | Description |
| --- | --- | --- | --- | --- |
| `automation_run_total` | Counter | `automation_id`, `outcome` | — | Automation run outcomes (`success` / `failed` / `throttled`) |
| `automation_run_duration_seconds` | Histogram | `automation_id`, `trigger_type` | seconds | Automation end-to-end duration |

## Label cardinality

Keep label cardinality bounded:

| Label | Cardinality budget | Notes |
| --- | --- | --- |
| `method` | ~10 | GET/POST/PUT/PATCH/DELETE/... |
| `route` | ~200 | Use Fastify/Nest route template, NOT raw URL |
| `status_code` | ~30 | 200/201/204/400/401/403/404/409/422/429/500/502/503/... |
| `table` | ~50 | Prisma table names — bounded by schema, safe |
| `webhook_id` | ~10k | Acceptable for self-hosted; sample at higher scale |
| `model` | ~10 | Bounded by AI provider config |
| `action` | ~20 | `classify` / `summarize` / `translate` / `generate` / ... |
| `automation_id` | unbounded | **Hot path** — keep behind feature flag, hash if too high |

> **NEVER** use raw user IDs / row IDs / arbitrary strings as label values —
> this blows up Prometheus memory. Hash or bucket them.

## Example PromQL

### p95 HTTP latency per route
```promql
histogram_quantile(0.95,
  sum by (route, le) (
    rate(http_request_duration_seconds_bucket[5m])
  )
)
```

### Error rate (5xx + 4xx where status_code matches)
```promql
sum(rate(http_requests_total{status_class="5xx"}[5m]))
/
sum(rate(http_requests_total[5m]))
```

### Webhook dead-letter rate
```promql
sum(rate(webhook_delivery_total{outcome="dead_letter"}[5m]))
```

### AI token burn by model
```promql
sum by (model) (rate(ai_tokens_total[1h])) * 3600
```

### SLO: 99% of reads < 200ms
```promql
1 - (
  sum(rate(http_request_duration_seconds_bucket{le="0.2"}[5m]))
  /
  sum(rate(http_request_duration_seconds_count[5m]))
)
```

## Adding a new metric

1. Define label conventions in `metric-definitions.ts` (const tuple + literal union)
2. Register the histogram / counter in `metric-recorder.ts` with bucket boundaries
3. Wrap calls in a domain helper (e.g. `recordWebhookOutcome()`) — never call metric
   instances directly from controllers / services
4. Add a unit test under `*.spec.ts` verifying label shape
5. Document the new metric in this catalog (table above + PromQL example)

## Related

- `/metrics` endpoint — text/plain Prometheus exposition format
- `OpenTelemetry` traces — see `tracing.ts`
- SLO targets — see `SLO.md` (Wave 12 second-batch)
