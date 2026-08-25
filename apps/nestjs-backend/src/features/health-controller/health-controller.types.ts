/**
 * Health controller — types (Stage 98).
 */

export type HealthState = 'healthy' | 'degraded' | 'unhealthy';

export interface ICheckResult {
  /** Check name. */
  name: string;
  /** Whether the check passed. */
  ok: boolean;
  /** Optional message. */
  detail?: string;
  /** Latency. */
  durationMs: number;
}

export interface IHealthSnapshot {
  state: HealthState;
  appName: string;
  version: string;
  checks: ICheckResult[];
  uptimeMs: number;
  now: string;
}

export const MAX_CHECKS = 32;
export const MAX_CHECK_NAME_LENGTH = 64;