/**
 * Canary — thin-DI wrapper (Stage N).
 *
 * Pure helpers for the canary lag/trip computation. Consumed by
 * `CanaryAuthService` (auth-only surface); the full V2 routing logic
 * remains in `canary.service.ts`.
 */

import type { ICanaryTripResult } from './canary.types';

/**
 * Compute the absolute lag between `observedAt` and `expectedAt`, in
 * milliseconds. Negative values (clock skew the other direction) are
 * clamped at 0 to keep the threshold comparison monotonic.
 */
export function computeCanaryLag(observedAt: Date, expectedAt: Date): number {
  const diff = observedAt.getTime() - expectedAt.getTime();
  return diff > 0 ? diff : 0;
}

/** True when the observed lag exceeds the configured threshold. */
export function shouldTripCanary(observedLagMs: number, thresholdMs: number): ICanaryTripResult {
  const tripped = observedLagMs > thresholdMs;
  return {
    tripped,
    observedLagMs,
    thresholdMs,
    ...(tripped ? { reason: 'lag-exceeded' as const } : {}),
  };
}
