/**
 * automation-metrics — Wave 12 observability.
 *
 * Thin re-export layer for automation run counters. This module exists
 * so other features (automation, automation-canvas, automation-trigger)
 * have a single, stable import path for `recordAutomationRun`.
 *
 * The actual side effect lives in `metric-recorder.ts`; this file does
 * NOT mutate AutomationService — it just exposes typed helpers that
 * other code can call.
 *
 * NOTE: `automation_id` is on the HIGH_CARDINALITY_LABELS list. Dashboards
 * MUST aggregate over automation_id before rendering per-automation
 * rows; the underlying Prometheus query should always include a
 * top-N / total-other pattern.
 */

export { recordAutomationRun } from './metric-recorder';

export type AutomationOutcome = 'success' | 'failed' | 'throttled';