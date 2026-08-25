/**
 * E2E guard smoke — pure helpers (Stage 102).
 */

import {
  isAuthorized,
  outcomeFor,
  shouldDeny,
  statusFor,
  buildError,
} from '../interceptor-guard/interceptor-guard.service';
import type { IAuthContext, IErrorEnvelope } from '../interceptor-guard/interceptor-guard.types';
import type {
  IGuardSmokeCase,
  IGuardSmokeExecutor,
  IGuardSmokeReport,
  IGuardSmokeResult,
  GuardSmokeOutcome,
} from './e2e-guard-smoke.types';
import { MAX_GUARD_CASES } from './e2e-guard-smoke.types';

/** Validate a guard smoke case. */
export function validateGuardCase(c: IGuardSmokeCase): string | null {
  if (!c.id) return 'id required';
  if (!c.ctx) return 'ctx required';
  if (!Array.isArray(c.ctx.roles)) return 'ctx.roles must be array';
  if (!c.ctx.action) return 'ctx.action required';
  return null;
}

/** Decide the actual outcome for a guard case. */
export function guardOutcomeFor(input: {
  ctx: IAuthContext;
  requiredRoles?: ReadonlyArray<string>;
  errored?: boolean;
}): GuardSmokeOutcome {
  if (input.errored) return 'errored';
  const o = outcomeFor({ ctx: input.ctx, requiredRoles: input.requiredRoles });
  if (o === 'ok') return 'allowed';
  if (o === 'denied') return 'denied';
  return 'errored';
}

/** Run a single guard case — returns the synthesized result. */
export async function runGuardCase(input: {
  case: IGuardSmokeCase;
  executor?: IGuardSmokeExecutor;
  now?: () => number;
}): Promise<IGuardSmokeResult> {
  const err = validateGuardCase(input.case);
  if (err) {
    return {
      id: input.case.id,
      description: input.case.description,
      expected: input.case.expected,
      actual: 'errored',
      passed: false,
      detail: err,
    };
  }
  let traceId: string | undefined;
  let status: number | undefined;
  let detail: string | undefined;
  const actual = guardOutcomeFor({
    ctx: input.case.ctx,
    requiredRoles: input.case.requiredRoles,
    errored: input.case.errored,
  });
  if (input.executor) {
    try {
      const r = await input.executor.execute({
        ctx: input.case.ctx,
        requiredRoles: input.case.requiredRoles,
      });
      traceId = r.traceId;
      status = r.status;
    } catch (e) {
      detail = e instanceof Error ? e.message : 'unknown';
    }
  } else {
    detail = `principal=${input.case.ctx.principal ?? 'anon'} action=${input.case.ctx.action}`;
  }
  return {
    id: input.case.id,
    description: input.case.description,
    expected: input.case.expected,
    actual,
    passed: actual === input.case.expected,
    traceId,
    status,
    detail,
  };
}

/** Cap case list to maximum. */
export function capGuardCases(cases: ReadonlyArray<IGuardSmokeCase>): IGuardSmokeCase[] {
  if (cases.length <= MAX_GUARD_CASES) return cases.slice();
  return cases.slice(0, MAX_GUARD_CASES);
}

/** Run all guard cases sequentially. */
export async function runGuardSmoke(input: {
  cases: ReadonlyArray<IGuardSmokeCase>;
  executor?: IGuardSmokeExecutor;
  now?: () => number;
}): Promise<IGuardSmokeReport> {
  const started = (input.now ?? Date.now)();
  const results: IGuardSmokeResult[] = [];
  for (const c of input.cases) {
    const r = await runGuardCase({ case: c, executor: input.executor, now: input.now });
    results.push(r);
  }
  const finished = (input.now ?? Date.now)();
  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
    durationMs: finished - started,
  };
}

/** Filter results to failures. */
export function guardFailures(report: IGuardSmokeReport): IGuardSmokeResult[] {
  return report.results.filter((r) => !r.passed);
}

/** Pass rate. */
export function guardPassRate(report: IGuardSmokeReport): number {
  if (report.total === 0) return 1;
  return report.passed / report.total;
}

/** Build the canonical case matrix (deny, allow, forbidden, error). */
export function buildCanonicalCases(input: { fixtureId: string }): IGuardSmokeCase[] {
  return [
    {
      id: `${input.fixtureId}-allow`,
      description: 'principal present, role matches',
      ctx: { principal: 'u1', roles: ['admin'], action: 'read' },
      requiredRoles: ['admin'],
      expected: 'allowed',
    },
    {
      id: `${input.fixtureId}-deny`,
      description: 'principal missing',
      ctx: { principal: null, roles: [], action: 'read' },
      requiredRoles: ['admin'],
      expected: 'denied',
    },
    {
      id: `${input.fixtureId}-forbidden`,
      description: 'principal present but role missing',
      ctx: { principal: 'u2', roles: ['viewer'], action: 'read' },
      requiredRoles: ['admin'],
      expected: 'denied',
    },
    {
      id: `${input.fixtureId}-errored`,
      description: 'execution errors',
      ctx: { principal: 'u3', roles: ['admin'], action: 'admin' },
      requiredRoles: ['admin'],
      errored: true,
      expected: 'errored',
    },
  ];
}

/** Synthesize an error envelope from a guard case. */
export function envelopeForCase(input: {
  case: IGuardSmokeCase;
  traceId: string;
}): IErrorEnvelope {
  if (input.case.expected === 'allowed') {
    return buildError({ code: 'not_found', message: 'unused', traceId: input.traceId });
  }
  if (input.case.expected === 'denied') {
    const code = input.case.ctx.principal ? 'forbidden' : 'unauthorized';
    return buildError({ code, message: 'denied', traceId: input.traceId });
  }
  return buildError({ code: 'internal', message: 'errored', traceId: input.traceId });
}

/** Re-export isAuthorized and shouldDeny for callers. */
export { isAuthorized, shouldDeny };

/** Status for an outcome (allowed → 200, denied → 401/403, errored → 500). */
export function statusForOutcome(input: {
  outcome: GuardSmokeOutcome;
  principal: string | null;
}): number {
  if (input.outcome === 'allowed') return 200;
  if (input.outcome === 'denied') {
    return input.principal ? statusFor('forbidden') : statusFor('unauthorized');
  }
  return statusFor('internal');
}
