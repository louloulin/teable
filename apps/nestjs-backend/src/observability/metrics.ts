/**
 * Prometheus metrics initialization (Wave 12 — R12-T01).
 *
 * `initMetrics()` is the canonical entry point. It is idempotent: subsequent
 * calls return the same registry handle.
 *
 * Setup:
 *   - Default process metrics (CPU, memory, event loop lag, GC, file handles)
 *   - Domain-specific histograms and counters (HTTP, DB, webhooks, AI, automation)
 *   - Bucket boundaries chosen for SLO targets (95th/99th percentile latency)
 *
 * The metrics layer is separate from the OpenTelemetry traces (see
 * `tracing.ts`) because Prometheus pulls the `/metrics` endpoint on a fixed
 * cadence, whereas OTel pushes traces asynchronously. The two are reconciled
 * by the SLO dashboards in Wave 12 second-batch.
 */

import { Logger } from '@nestjs/common';
import client from 'prom-client';

const logger = new Logger('ObservabilityMetrics');

const GLOBAL_KEY = '__teable_observability_metrics_registry__';
type GlobalShape = typeof globalThis & { [GLOBAL_KEY]?: client.Registry };
const g = globalThis as GlobalShape;

const HTTP_BUCKETS_SECONDS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DB_BUCKETS_SECONDS = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5];
const AI_BUCKETS_SECONDS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];
const WEBHOOK_BUCKETS_SECONDS = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30];
const AUTOMATION_BUCKETS_SECONDS = [0.05, 0.1, 0.5, 1, 5, 10, 60, 300];

/**
 * Lazily-registered domain metrics. These are added to the registry on first
 * `initMetrics()` call. Subsequent `initMetrics()` calls return the same
 * instances because the registry is cached on `globalThis`.
 */
let httpRequestDuration: client.Histogram<string> | undefined;
let httpRequestsTotal: client.Counter<string> | undefined;
let dbQueryDuration: client.Histogram<string> | undefined;
let dbQueriesTotal: client.Counter<string> | undefined;
let webhookDeliveryTotal: client.Counter<string> | undefined;
let webhookDeliveryDuration: client.Histogram<string> | undefined;
let webhookRetryTotal: client.Counter<string> | undefined;
let aiRequestsTotal: client.Counter<string> | undefined;
let aiRequestDuration: client.Histogram<string> | undefined;
let aiTokensTotal: client.Counter<string> | undefined;
let automationRunTotal: client.Counter<string> | undefined;
let automationRunDuration: client.Histogram<string> | undefined;

function registerDomainMetrics(registry: client.Registry): void {
  httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'End-to-end HTTP request latency in seconds.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: HTTP_BUCKETS_SECONDS,
    registers: [registry],
  });

  httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP responses by status class.',
    labelNames: ['method', 'route', 'status_class'] as const,
    registers: [registry],
  });

  dbQueryDuration = new client.Histogram({
    name: 'db_query_duration_seconds',
    help: 'Prisma query wall-clock time in seconds.',
    labelNames: ['operation', 'table'] as const,
    buckets: DB_BUCKETS_SECONDS,
    registers: [registry],
  });

  dbQueriesTotal = new client.Counter({
    name: 'db_queries_total',
    help: 'Total Prisma queries by outcome.',
    labelNames: ['operation', 'table', 'outcome'] as const,
    registers: [registry],
  });

  webhookDeliveryTotal = new client.Counter({
    name: 'webhook_delivery_total',
    help: 'Webhook delivery outcomes.',
    labelNames: ['outcome', 'webhook_id'] as const,
    registers: [registry],
  });

  webhookDeliveryDuration = new client.Histogram({
    name: 'webhook_delivery_duration_seconds',
    help: 'End-to-end webhook delivery time.',
    labelNames: ['outcome', 'webhook_id'] as const,
    buckets: WEBHOOK_BUCKETS_SECONDS,
    registers: [registry],
  });

  webhookRetryTotal = new client.Counter({
    name: 'webhook_retry_total',
    help: 'Webhook retry attempts before terminal outcome.',
    labelNames: ['outcome', 'attempt'] as const,
    registers: [registry],
  });

  aiRequestsTotal = new client.Counter({
    name: 'ai_requests_total',
    help: 'AI requests by model and action.',
    labelNames: ['model', 'action', 'outcome'] as const,
    registers: [registry],
  });

  aiRequestDuration = new client.Histogram({
    name: 'ai_request_duration_seconds',
    help: 'AI request latency.',
    labelNames: ['model', 'action'] as const,
    buckets: AI_BUCKETS_SECONDS,
    registers: [registry],
  });

  aiTokensTotal = new client.Counter({
    name: 'ai_tokens_total',
    help: 'AI token usage by direction.',
    labelNames: ['model', 'direction'] as const,
    registers: [registry],
  });

  automationRunTotal = new client.Counter({
    name: 'automation_run_total',
    help: 'Automation run outcomes.',
    labelNames: ['automation_id', 'outcome'] as const,
    registers: [registry],
  });

  automationRunDuration = new client.Histogram({
    name: 'automation_run_duration_seconds',
    help: 'Automation end-to-end duration.',
    labelNames: ['automation_id', 'trigger_type'] as const,
    buckets: AUTOMATION_BUCKETS_SECONDS,
    registers: [registry],
  });
}

/**
 * Lazily get a metric instance. Throws if `initMetrics()` has not been called.
 * Used by domain helpers (e.g. WebhookService.recordOutcome()) that need to
 * increment a counter without re-registering.
 */
export function getMetrics() {
  if (!httpRequestDuration) {
    throw new Error('Metrics not initialized. Call initMetrics() at startup.');
  }
  return {
    registry: g[GLOBAL_KEY]!,
    httpRequestDuration,
    httpRequestsTotal,
    dbQueryDuration,
    dbQueriesTotal,
    webhookDeliveryTotal,
    webhookDeliveryDuration,
    webhookRetryTotal,
    aiRequestsTotal,
    aiRequestDuration,
    aiTokensTotal,
    automationRunTotal,
    automationRunDuration,
  } as const;
}

/**
 * Initialize the Prometheus registry and register domain metrics. Idempotent —
 * subsequent calls return the existing registry. Safe to call from
 * `bootstrap.ts` and from test setup.
 */
export function initMetrics(): client.Registry {
  if (g[GLOBAL_KEY]) {
    return g[GLOBAL_KEY]!;
  }

  const registry = new client.Registry();
  registry.setDefaultLabels({
    service: process.env.OTEL_SERVICE_NAME?.trim() || 'teable-nestjs-backend',
    env: process.env.DEPLOYMENT_ENVIRONMENT?.trim() || process.env.NODE_ENV?.trim() || 'development',
  });

  client.collectDefaultMetrics({ register: registry, prefix: '' });
  registerDomainMetrics(registry);

  g[GLOBAL_KEY] = registry;
  logger.log('Prometheus registry initialized');
  return registry;
}

/**
 * Test-only helper. Wipes the cached registry so the next `initMetrics()`
 * call re-registers from scratch. Never call from production code paths.
 */
export function __resetMetricsForTests(): void {
  delete g[GLOBAL_KEY];
  httpRequestDuration = undefined;
  httpRequestsTotal = undefined;
  dbQueryDuration = undefined;
  dbQueriesTotal = undefined;
  webhookDeliveryTotal = undefined;
  webhookDeliveryDuration = undefined;
  webhookRetryTotal = undefined;
  aiRequestsTotal = undefined;
  aiRequestDuration = undefined;
  aiTokensTotal = undefined;
  automationRunTotal = undefined;
  automationRunDuration = undefined;
}

/**
 * Test-only helper. Returns the cached registry without mutating state.
 */
export function __getRegistryForTests(): client.Registry | undefined {
  return g[GLOBAL_KEY];
}
