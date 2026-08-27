/**
 * webhook-metrics — Wave 12 observability.
 *
 * Thin re-export layer for webhook delivery outcome counters. This
 * module exists so other features (webhook-delivery, automation
 * webhook-dispatcher, etc.) have a single, stable import path for
 * `recordWebhookOutcome`.
 *
 * The actual side effect lives in `metric-recorder.ts`; this file does
 * NOT mutate any existing service — it just exposes a typed helper.
 */

export { recordWebhookOutcome } from './metric-recorder';

export type WebhookOutcome = 'success' | 'failed' | 'dead_letter';
