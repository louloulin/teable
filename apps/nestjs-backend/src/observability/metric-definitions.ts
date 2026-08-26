/**
 * Central metric definitions for Wave 12 observability.
 *
 * This module is the CONFIGURATION layer: it declares the canonical
 * metric names, label names, label value unions, bucket boundaries, and
 * label-builder helpers that every other observability file (HTTP / DB /
 * webhook / AI / automation) consumes.
 *
 * IMPORTANT — design rules
 *  - This file must NOT depend on `prom-client`. The actual Counter /
 *    Histogram registration happens in T-12-01's metrics module; we only
 *    own the *shape* of the metric family (name + labels + buckets +
 *    value vocabulary) so all modules agree.
 *  - Helpers that DO need to mutate a registry (lazy instance getters)
 *    are typed against a minimal `IRegistryLike` interface, supplied by
 *    T-12-01's registration module. This keeps the surface small and
 *    testable without pulling prom-client into the type graph.
 *  - All label values use string-literal unions so misspellings surface at
 *    compile time, and so dashboards / alerts have a stable vocabulary.
 */

/* eslint-disable @typescript-eslint/naming-convention */

// ---------------------------------------------------------------------------
// Label name constants — use the const-tuple pattern so the same string
// literal is shared across definitions, tests, and dashboards.
// ---------------------------------------------------------------------------

export const HTTP_LABELS = ['method', 'route', 'status_code'] as const;
export type HttpLabel = (typeof HTTP_LABELS)[number];
export type HttpMethodLabel =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'OPTIONS'
  | 'HEAD'
  | 'OTHER';
export type HttpRouteLabel = string; // templated path, e.g. '/api/table/:tableId/record'
export type HttpStatusCodeLabel = string; // '200' | '404' | '500' | ...

export const DB_LABELS = ['operation', 'table', 'outcome'] as const;
export type DbLabel = (typeof DB_LABELS)[number];
export type DbOperationLabel =
  | 'findUnique'
  | 'findFirst'
  | 'findMany'
  | 'create'
  | 'createMany'
  | 'update'
  | 'updateMany'
  | 'upsert'
  | 'delete'
  | 'deleteMany'
  | 'count'
  | 'aggregate'
  | 'groupBy'
  | 'executeRaw'
  | 'queryRaw'
  | 'transaction'
  | 'other';
export type DbTableLabel = string; // Prisma model name, e.g. 'table', 'record', 'user'
export type DbOutcomeLabel = 'success' | 'failed' | 'timeout';

export const WEBHOOK_LABELS = ['outcome', 'webhook_id'] as const;
export type WebhookLabel = (typeof WEBHOOK_LABELS)[number];
export type WebhookOutcomeLabel = 'success' | 'failed' | 'dead_letter';

export const AI_LABELS = ['model', 'action', 'outcome'] as const;
export type AiLabel = (typeof AI_LABELS)[number];
export type AiModelLabel = string; // e.g. 'gpt-4o-mini', 'claude-3-5-sonnet'
export type AiActionLabel =
  | 'chat'
  | 'completion'
  | 'embedding'
  | 'field_prompt'
  | 'vision'
  | 'tool_use'
  | 'other';
export type AiOutcomeLabel = 'success' | 'failed' | 'rate_limited' | 'timeout';

export const AUTOMATION_LABELS = ['automation_id', 'outcome'] as const;
export type AutomationLabel = (typeof AUTOMATION_LABELS)[number];
export type AutomationOutcomeLabel = 'success' | 'failed' | 'throttled';

export const TOKEN_LABELS = ['model', 'action'] as const;
export type TokenLabel = (typeof TOKEN_LABELS)[number];

// ---------------------------------------------------------------------------
// Metric names — exported so dashboards and tests reference one source of
// truth rather than scattered string literals.
// ---------------------------------------------------------------------------

export const METRIC_NAMES = {
  httpRequestDurationSeconds: 'http_request_duration_seconds',
  httpRequestsTotal: 'http_requests_total',
  dbQueryDurationSeconds: 'db_query_duration_seconds',
  webhookDeliveryTotal: 'webhook_delivery_total',
  aiRequestsTotal: 'ai_requests_total',
  aiTokensTotal: 'ai_tokens_total',
  automationRunTotal: 'automation_run_total',
} as const;

export type MetricName = (typeof METRIC_NAMES)[keyof typeof METRIC_NAMES];

// ---------------------------------------------------------------------------
// Bucket boundaries — chosen for the latency profile of each subsystem.
// HTTP buckets span 5ms..10s so they fit typical SLO shapes (p95 under
// ~250ms is the common target). DB buckets span 1ms..5s because Prisma
// queries are usually much shorter than external HTTP calls.
// ---------------------------------------------------------------------------

/** In seconds, expressed as fractions so downstream code can `seconds()` it. */
export const HTTP_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
] as const;

/** In seconds. */
export const DB_DURATION_BUCKETS_SECONDS = [
  0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 5,
] as const;

// ---------------------------------------------------------------------------
// Cardinality budget — a label is "high cardinality" if it can grow
// unboundedly (per-record, per-request-id, etc.). The helpers below apply
// these rules defensively so a misuse doesn't blow up Prometheus.
// ---------------------------------------------------------------------------

/**
 * Maximum number of distinct values a label should hold in production.
 * If you find yourself adding a label that could exceed this, normalise
 * it first (templated path, coarse status bucket, etc.).
 */
export const LABEL_CARDINALITY_BUDGET = {
  // Per-route HTTP labels are intentionally bounded by Express routing.
  http_route: 10_000,
  http_status_code: 64, // status codes + a few grouped buckets
  http_method: 8,
  // DB table names come from the Prisma schema; bounded.
  db_table: 200,
  db_operation: 20,
  // Webhook IDs scale with tenant count. Acceptable for now.
  webhook_id: 100_000,
  // AI models — bounded by the catalog.
  ai_model: 50,
  ai_action: 20,
  // Automations can be created freely by users, so this IS the riskiest.
  // The dashboard layer MUST aggregate before slicing by automation_id.
  automation_id: 50_000,
} as const;

/** Labels that we explicitly flag as risky for dashboards. */
export const HIGH_CARDINALITY_LABELS: ReadonlyArray<string> = [
  'automation_id',
  'webhook_id',
];

// ---------------------------------------------------------------------------
// Label-builders — pure functions. Same input, same output. They never
// touch a registry. Tests rely on these being deterministic.
// ---------------------------------------------------------------------------

/**
 * Build the canonical HTTP duration label tuple. `route` should already
 * be templated (e.g. `/api/table/:tableId/record`); `extractRoute()` in
 * the interceptor handles the templating.
 */
export function httpDurationLabels(
  method: string,
  route: string,
  statusCode: number | string
): { method: string; route: string; status_code: string } {
  return {
    method: normaliseMethod(method),
    route,
    status_code: normaliseStatusCode(statusCode),
  };
}

export function httpRequestLabels(
  method: string,
  route: string,
  statusCode: number | string
): { method: string; route: string; status_code: string } {
  return httpDurationLabels(method, route, statusCode);
}

/**
 * Build the canonical DB duration label tuple.
 */
export function dbDurationLabels(
  operation: string,
  table: string,
  outcome: DbOutcomeLabel | 'success' = 'success'
): { operation: string; table: string; outcome: DbOutcomeLabel } {
  return {
    operation: normaliseOperation(operation),
    table,
    outcome,
  };
}

export function webhookOutcomeLabels(
  outcome: WebhookOutcomeLabel,
  webhookId: string
): { outcome: WebhookOutcomeLabel; webhook_id: string } {
  return { outcome, webhook_id: webhookId };
}

export function aiRequestLabels(
  model: string,
  action: string,
  outcome: AiOutcomeLabel
): { model: string; action: string; outcome: AiOutcomeLabel } {
  return { model, action: normaliseAiAction(action), outcome };
}

export function automationRunLabels(
  automationId: string,
  outcome: AutomationOutcomeLabel
): { automation_id: string; outcome: AutomationOutcomeLabel } {
  return { automation_id: automationId, outcome };
}

export function tokenLabels(
  model: string,
  action: string
): { model: string; action: string } {
  return { model, action: normaliseAiAction(action) };
}

// ---------------------------------------------------------------------------
// Normalisation helpers — applied before labels are recorded so the
// downstream time series stay bounded.
// ---------------------------------------------------------------------------

/** Upper-case HTTP methods; anything unknown collapses to 'OTHER'. */
export function normaliseMethod(method: string): HttpMethodLabel {
  const m = method.toUpperCase();
  switch (m) {
    case 'GET':
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
    case 'OPTIONS':
    case 'HEAD':
      return m;
    default:
      return 'OTHER';
  }
}

/**
 * Status code as a string. We keep the raw value (no bucketing into
 * "2xx/4xx/5xx") because the buckets we alert on depend on the actual
 * value — a 503 vs a 504 are operationally different. We DO cap the
 * range to keep cardinality bounded.
 */
export function normaliseStatusCode(code: number | string): string {
  const n = typeof code === 'string' ? parseInt(code, 10) : code;
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n > 599) return '600';
  return n.toString();
}

/** Lower-case + strip query string so DB tables are bounded by the schema. */
export function normaliseTable(table: string): string {
  if (!table) return 'unknown';
  return table.toLowerCase().split(' ')[0] || 'unknown';
}

/**
 * Map any Prisma action verb into the canonical union. Anything not in
 * the list collapses to 'other' so an unknown verb doesn't explode the
 * label cardinality.
 */
export function normaliseOperation(op: string): DbOperationLabel {
  switch (op) {
    case 'findUnique':
    case 'findFirst':
    case 'findMany':
    case 'create':
    case 'createMany':
    case 'update':
    case 'updateMany':
    case 'upsert':
    case 'delete':
    case 'deleteMany':
    case 'count':
    case 'aggregate':
    case 'groupBy':
    case 'executeRaw':
    case 'queryRaw':
      return op;
    case '$transaction':
      return 'transaction';
    default:
      return 'other';
  }
}

export function normaliseAiAction(action: string): AiActionLabel {
  switch (action) {
    case 'chat':
    case 'completion':
    case 'embedding':
    case 'field_prompt':
    case 'vision':
    case 'tool_use':
      return action;
    default:
      return 'other';
  }
}

// ---------------------------------------------------------------------------
// Lazy metric getters — typed against a minimal registry interface so
// T-12-01 can inject the real prom-client registry at runtime. Tests can
// inject a stub registry that records calls instead of recording metrics.
// ---------------------------------------------------------------------------

/**
 * Subset of the registry surface the helpers actually need. The full
 * prom-client types are NOT imported here on purpose — keeps this file
 * dependency-free and lets the implementation file (T-12-01) own the
 * concrete type wiring.
 */
export interface IRegistryLike {
  getOrCreateCounter(
    name: string,
    help: string,
    labelNames: readonly string[]
  ): ICounterLike;
  getOrCreateHistogram(
    name: string,
    help: string,
    labelNames: readonly string[],
    buckets: readonly number[]
  ): IHistogramLike;
}

/** Minimal Counter surface — what helpers actually call. */
export interface ICounterLike {
  inc(labels: Record<string, string>, value?: number): void;
}

/** Minimal Histogram surface — what helpers actually call. */
export interface IHistogramLike {
  observe(labels: Record<string, string>, valueSeconds: number): void;
}

export interface IMetricRegistryHandle {
  registry: IRegistryLike;
}

/**
 * Per-process registry handle. Set by T-12-01's bootstrap; if unset, the
 * helpers degrade to NO-OP counters so tests and partial boot states
 * remain safe.
 *
 * Module-loaders MUST call `setMetricRegistry()` exactly once during
 * process init, before the first request is served.
 */
let registryHandle: IMetricRegistryHandle | undefined;

/**
 * Pure test seam: clear the registry handle. After calling this, the
 * helpers become no-ops again. Production code MUST NOT call this.
 */
export function __resetMetricRegistryForTests(): void {
  registryHandle = undefined;
  counterCache.clear();
  histogramCache.clear();
}

/** Production init — called by T-12-01. */
export function setMetricRegistry(handle: IMetricRegistryHandle): void {
  registryHandle = handle;
}

function requireRegistry(): IRegistryLike | undefined {
  return registryHandle?.registry;
}

// ---------------------------------------------------------------------------
// Lazy instance caches — keyed by metric name. Counter / Histogram
// instances are created exactly once per registry handle so re-recording
// doesn't re-register with prom-client (which would throw).
// ---------------------------------------------------------------------------

interface ICounterSpec {
  name: string;
  help: string;
  labelNames: readonly string[];
}
interface IHistogramSpec {
  name: string;
  help: string;
  labelNames: readonly string[];
  buckets: readonly number[];
}

const counterCache = new Map<string, { spec: ICounterSpec; instance: ICounterLike }>();
const histogramCache = new Map<string, { spec: IHistogramSpec; instance: IHistogramLike }>();

export function getOrCreateCounter(spec: ICounterSpec): ICounterLike | undefined {
  const reg = requireRegistry();
  if (!reg) return undefined;
  const cached = counterCache.get(spec.name);
  if (cached) return cached.instance;
  const instance = reg.getOrCreateCounter(spec.name, spec.help, spec.labelNames);
  counterCache.set(spec.name, { spec, instance });
  return instance;
}

export function getOrCreateHistogram(spec: IHistogramSpec): IHistogramLike | undefined {
  const reg = requireRegistry();
  if (!reg) return undefined;
  const cached = histogramCache.get(spec.name);
  if (cached) return cached.instance;
  const instance = reg.getOrCreateHistogram(spec.name, spec.help, spec.labelNames, spec.buckets);
  histogramCache.set(spec.name, { spec, instance });
  return instance;
}

// ---------------------------------------------------------------------------
// Counter specs — exported so tests can assert the exact shape and so
// dashboards can query by the canonical help string.
// ---------------------------------------------------------------------------

export const HTTP_REQUEST_COUNTER_SPEC: ICounterSpec = {
  name: METRIC_NAMES.httpRequestsTotal,
  help: 'Total HTTP requests served, partitioned by method, route template, and status code.',
  labelNames: HTTP_LABELS,
};

export const HTTP_REQUEST_DURATION_SPEC: IHistogramSpec = {
  name: METRIC_NAMES.httpRequestDurationSeconds,
  help: 'End-to-end HTTP request duration in seconds, partitioned by method, route template, and status code.',
  labelNames: HTTP_LABELS,
  buckets: HTTP_DURATION_BUCKETS_SECONDS,
};

export const DB_QUERY_DURATION_SPEC: IHistogramSpec = {
  name: METRIC_NAMES.dbQueryDurationSeconds,
  help: 'Prisma query duration in seconds, partitioned by operation, table, and outcome.',
  labelNames: DB_LABELS,
  buckets: DB_DURATION_BUCKETS_SECONDS,
};

export const WEBHOOK_DELIVERY_COUNTER_SPEC: ICounterSpec = {
  name: METRIC_NAMES.webhookDeliveryTotal,
  help: 'Total webhook delivery attempts, partitioned by outcome and webhook id.',
  labelNames: WEBHOOK_LABELS,
};

export const AI_REQUEST_COUNTER_SPEC: ICounterSpec = {
  name: METRIC_NAMES.aiRequestsTotal,
  help: 'Total AI provider requests, partitioned by model, action, and outcome.',
  labelNames: AI_LABELS,
};

export const AI_TOKEN_COUNTER_SPEC: ICounterSpec = {
  name: METRIC_NAMES.aiTokensTotal,
  help: 'Total AI tokens consumed (prompt + completion), partitioned by model and action.',
  labelNames: TOKEN_LABELS,
};

export const AUTOMATION_RUN_COUNTER_SPEC: ICounterSpec = {
  name: METRIC_NAMES.automationRunTotal,
  help: 'Total automation runs, partitioned by automation id and outcome.',
  labelNames: AUTOMATION_LABELS,
};

/**
 * Outcome labels exposed for dashboards / alert rules. Keys are the
 * `outcome` label values; values are short human descriptions.
 */
export const OUTCOME_LABEL_DESCRIPTIONS: Record<string, string> = {
  success: 'Operation completed normally (HTTP 2xx / DB ok / webhook delivered / AI response received / automation succeeded).',
  failed: 'Operation failed with an error.',
  dead_letter: 'Webhook exhausted retries and was dropped to the dead-letter queue.',
  rate_limited: 'AI provider rejected the request due to rate limiting.',
  timeout: 'Operation exceeded its time budget.',
  throttled: 'Operation deferred by the local throttle before being attempted.',
  error: 'HTTP 5xx response or uncaught exception.',
};