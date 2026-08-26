/**
 * Canary — thin-DI wrapper (Stage N).
 *
 * Minimal types for the canary auth surface. The full V2 decision flow
 * (shouldUseV2, shouldUseV2WithReason, etc.) stays in `canary.service.ts`;
 * this surface declares the trip / lag shape used by the auth helpers.
 */

export interface ICanaryTripReason {
  reason: 'lag-exceeded' | 'error-rate-exceeded' | 'manual';
  observedLagMs: number;
  thresholdMs: number;
}

export interface ICanaryTripResult {
  tripped: boolean;
  reason?: ICanaryTripReason['reason'];
  observedLagMs: number;
  thresholdMs: number;
}
