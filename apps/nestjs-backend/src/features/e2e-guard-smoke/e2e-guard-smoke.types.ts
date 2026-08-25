/**
 * E2E guard smoke — types (Stage 102).
 */

import type { AuditAction, IAuthContext } from '../interceptor-guard/interceptor-guard.types';

export type GuardSmokeOutcome = 'allowed' | 'denied' | 'errored';

export interface IGuardSmokeCase {
  /** Stable id used in result rows. */
  id: string;
  /** Description for logging / reports. */
  description: string;
  ctx: IAuthContext;
  /** Roles the guard requires for `allowed`. */
  requiredRoles?: ReadonlyArray<string>;
  /** Whether the underlying action errors during execution. */
  errored?: boolean;
  /** Expected outcome. */
  expected: GuardSmokeOutcome;
}

export interface IGuardSmokeResult {
  id: string;
  description: string;
  expected: GuardSmokeOutcome;
  actual: GuardSmokeOutcome;
  passed: boolean;
  /** Audit trace id when applicable. */
  traceId?: string;
  /** Error envelope status when applicable. */
  status?: number;
  /** Free-form detail (audit action, principal, etc). */
  detail?: string;
}

export interface IGuardSmokeReport {
  total: number;
  passed: number;
  failed: number;
  results: IGuardSmokeResult[];
  durationMs: number;
}

export interface IGuardSmokeExecutor {
  /** Execute the guarded action, returning success/error. */
  execute(input: {
    ctx: IAuthContext;
    requiredRoles?: ReadonlyArray<string>;
  }): Promise<{ allowed: boolean; traceId: string; status: number }>;
}

export const MAX_GUARD_CASES = 256;
export const MAX_GUARD_RESULTS = 256;
