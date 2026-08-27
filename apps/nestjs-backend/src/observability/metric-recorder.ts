/**
 * metric-recorder — Wave 12 observability.
 *
 * Thin, side-effecting wrapper around the lazy instance getters in
 * `metric-definitions`. Every public helper here MUST be safe to call
 * from a hot path:
 *
 *   - No-op when the registry is not installed (so tests + early-boot
 *     states don't crash).
 *   - Synchronous: only calls `Counter.inc` / `Histogram.observe`, both
 *     of which are in-memory O(1).
 *   - Never throws into the caller. If metric registration throws (e.g.
 *     prom-client detects a duplicate), the failure is swallowed here
 *     so the request still succeeds.
 *
 * This file exists separately from `metric-definitions` so:
 *   1. The definitions module can stay pure / dependency-free of the
 *      registry handle plumbing.
 *   2. We have ONE chokepoint to swap the underlying prom-client binding
 *      in T-12-01 without touching every caller.
 */

import {
  AI_REQUEST_COUNTER_SPEC,
  AI_TOKEN_COUNTER_SPEC,
  AUTOMATION_RUN_COUNTER_SPEC,
  DB_QUERY_DURATION_SPEC,
  HTTP_REQUEST_COUNTER_SPEC,
  HTTP_REQUEST_DURATION_SPEC,
  WEBHOOK_DELIVERY_COUNTER_SPEC,
  __resetMetricRegistryForTests,
  aiRequestLabels,
  automationRunLabels,
  dbDurationLabels,
  getOrCreateCounter,
  getOrCreateHistogram,
  httpRequestLabels,
  setMetricRegistry,
  tokenLabels,
  webhookOutcomeLabels,
  type IMetricRegistryHandle,
} from './metric-definitions';

// Re-export the registry handle plumbing so callers can install the
// registry once at boot without importing metric-definitions directly.
export { __resetMetricRegistryForTests, setMetricRegistry, type IMetricRegistryHandle };

/**
 * Thin wrapper: same as setMetricRegistry in metric-definitions, but
 * named so consumers can wire it in their own bootstrap modules without
 * needing to know about the definitions module's internals.
 */
export function installMetricRegistry(handle: IMetricRegistryHandle): void {
  setMetricRegistry(handle);
}

// ---------------------------------------------------------------------------
// HTTP — recorded by the HttpDurationInterceptor.
// ---------------------------------------------------------------------------

/**
 * Record one HTTP request. Increments the counter AND observes the
 * histogram. Safe to call with statusCode=0 (interceptor fallback).
 */
export function recordHttpRequestMetrics(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number
): void {
  const labels = httpRequestLabels(method, route, statusCode);
  const counter = getOrCreateCounter(HTTP_REQUEST_COUNTER_SPEC);
  if (counter) {
    try {
      counter.inc(labels, 1);
    } catch {
      // never let metric failure break the request
    }
  }
  const histogram = getOrCreateHistogram(HTTP_REQUEST_DURATION_SPEC);
  if (histogram) {
    try {
      histogram.observe(labels, Math.max(0, durationSeconds));
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// DB — recorded by the DbDurationInterceptor from a Prisma `$on('query')`
// listener or a service-level wrapper.
// ---------------------------------------------------------------------------

/**
 * Record one DB query.
 *
 *   operation  — Prisma action verb (findFirst, create, …).
 *   table      — Prisma model name (lowercased by normaliseTable inside
 *                the label builder).
 *   outcome    — 'success' | 'failed' | 'timeout'.
 *   durationMs — measured duration, converted to seconds here.
 */
export function recordDbQuery(
  operation: string,
  table: string,
  outcome: 'success' | 'failed' | 'timeout',
  durationMs: number
): void {
  const labels = dbDurationLabels(operation, table, outcome);
  const histogram = getOrCreateHistogram(DB_QUERY_DURATION_SPEC);
  if (histogram) {
    try {
      histogram.observe(labels, Math.max(0, durationMs / 1000));
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Webhook delivery outcomes.
// ---------------------------------------------------------------------------

export function recordWebhookOutcome(
  outcome: 'success' | 'failed' | 'dead_letter',
  webhookId: string
): void {
  const labels = webhookOutcomeLabels(outcome, webhookId);
  const counter = getOrCreateCounter(WEBHOOK_DELIVERY_COUNTER_SPEC);
  if (counter) {
    try {
      counter.inc(labels, 1);
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// AI requests + tokens.
// ---------------------------------------------------------------------------

export function recordAiRequest(
  model: string,
  action: string,
  outcome: 'success' | 'failed' | 'rate_limited' | 'timeout'
): void {
  const labels = aiRequestLabels(model, action, outcome);
  const counter = getOrCreateCounter(AI_REQUEST_COUNTER_SPEC);
  if (counter) {
    try {
      counter.inc(labels, 1);
    } catch {
      // ignore
    }
  }
}

export function recordAiTokens(
  model: string,
  action: string,
  promptTokens: number,
  completionTokens: number
): void {
  const labels = tokenLabels(model, action);
  const counter = getOrCreateCounter(AI_TOKEN_COUNTER_SPEC);
  if (counter) {
    try {
      counter.inc(labels, Math.max(0, (promptTokens ?? 0) + (completionTokens ?? 0)));
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Automation runs.
// ---------------------------------------------------------------------------

export function recordAutomationRun(
  automationId: string,
  outcome: 'success' | 'failed' | 'throttled'
): void {
  const labels = automationRunLabels(automationId, outcome);
  const counter = getOrCreateCounter(AUTOMATION_RUN_COUNTER_SPEC);
  if (counter) {
    try {
      counter.inc(labels, 1);
    } catch {
      // ignore
    }
  }
}
