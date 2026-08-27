/**
 * ai-metrics — Wave 12 observability.
 *
 * Thin re-export layer for AI request + token counters. This module
 * exists so other features (ai service, ai-usage, etc.) have a single,
 * stable import path.
 *
 * The actual side effect lives in `metric-recorder.ts`; this file does
 * NOT mutate AiService — it just exposes typed helpers that other code
 * can call.
 */

export { recordAiRequest, recordAiTokens } from './metric-recorder';

export type AiOutcome = 'success' | 'failed' | 'rate_limited' | 'timeout';
