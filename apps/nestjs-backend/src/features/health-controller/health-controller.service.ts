/**
 * Health controller — pure helpers (Stage 98).
 */

import type {
  HealthState,
  ICheckResult,
  IHealthSnapshot,
} from './health-controller.types';
import { MAX_CHECKS, MAX_CHECK_NAME_LENGTH } from './health-controller.types';

/** Validate a check result. */
export function validateCheck(c: ICheckResult): string | null {
  if (!c.name) return 'name required';
  if (c.name.length > MAX_CHECK_NAME_LENGTH) return 'name too long';
  if (typeof c.durationMs !== 'number' || c.durationMs < 0) return 'durationMs invalid';
  return null;
}

/** Aggregate check results into a state. */
export function aggregateState(checks: ReadonlyArray<ICheckResult>): HealthState {
  if (checks.length === 0) return 'healthy';
  const failures = checks.filter((c) => !c.ok);
  if (failures.length === 0) return 'healthy';
  if (failures.length === checks.length) return 'unhealthy';
  return 'degraded';
}

/** Build a health snapshot. */
export function buildSnapshot(input: {
  appName: string;
  version: string;
  checks: ReadonlyArray<ICheckResult>;
  uptimeMs: number;
  now: string;
}): IHealthSnapshot {
  const checks = input.checks.slice(0, MAX_CHECKS);
  for (const c of checks) {
    const err = validateCheck(c);
    if (err) throw new Error(`invalid check ${c.name}: ${err}`);
  }
  return {
    state: aggregateState(checks),
    appName: input.appName,
    version: input.version,
    checks,
    uptimeMs: input.uptimeMs,
    now: input.now,
  };
}

/** Map state to HTTP status. */
export function statusForState(s: HealthState): number {
  switch (s) {
    case 'healthy':
      return 200;
    case 'degraded':
      return 200;
    case 'unhealthy':
      return 503;
    default:
      return 503;
  }
}

/** Whether the snapshot indicates liveness. */
export function isLive(s: IHealthSnapshot): boolean {
  return s.state !== 'unhealthy';
}

/** Whether the snapshot indicates readiness. */
export function isReady(s: IHealthSnapshot): boolean {
  return s.state === 'healthy';
}

/** Summarize failures. */
export function failures(s: IHealthSnapshot): ICheckResult[] {
  return s.checks.filter((c) => !c.ok);
}

/** Total check count. */
export function checkCount(s: IHealthSnapshot): number {
  return s.checks.length;
}

/** Pass rate. */
export function passRate(s: IHealthSnapshot): number {
  if (s.checks.length === 0) return 1;
  const passed = s.checks.filter((c) => c.ok).length;
  return passed / s.checks.length;
}

/** Synthesize a healthy check (e.g. for build-time generation). */
export function syntheticCheck(name: string): ICheckResult {
  return { name, ok: true, durationMs: 0 };
}