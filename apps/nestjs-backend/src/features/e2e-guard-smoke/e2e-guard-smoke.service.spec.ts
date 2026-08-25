/**
 * E2E guard smoke — pure helpers spec (Stage 102).
 */

import {
  buildCanonicalCases,
  capGuardCases,
  envelopeForCase,
  guardFailures,
  guardOutcomeFor,
  guardPassRate,
  isAuthorized,
  runGuardCase,
  runGuardSmoke,
  shouldDeny,
  statusForOutcome,
  validateGuardCase,
} from './e2e-guard-smoke.service';
import type { IGuardSmokeCase, IGuardSmokeExecutor } from './e2e-guard-smoke.types';

describe('e2e-guard-smoke.validateGuardCase', () => {
  it('passes', () => {
    expect(
      validateGuardCase({
        id: 'a',
        description: 'x',
        ctx: { principal: 'u', roles: ['admin'], action: 'read' },
        expected: 'allowed',
      })
    ).toBeNull();
  });
  it('rejects missing id', () => {
    expect(
      validateGuardCase({
        id: '',
        description: 'x',
        ctx: { principal: 'u', roles: ['admin'], action: 'read' },
        expected: 'allowed',
      })
    ).toContain('id');
  });
  it('rejects missing ctx', () => {
    expect(
      validateGuardCase({
        id: 'a',
        description: 'x',
        ctx: undefined as never,
        expected: 'allowed',
      })
    ).toContain('ctx');
  });
});

describe('e2e-guard-smoke.guardOutcomeFor / isAuthorized / shouldDeny', () => {
  it('allowed', () => {
    expect(
      guardOutcomeFor({
        ctx: { principal: 'u', roles: ['admin'], action: 'read' },
        requiredRoles: ['admin'],
      })
    ).toBe('allowed');
  });
  it('denied — no principal', () => {
    expect(
      guardOutcomeFor({
        ctx: { principal: null, roles: [], action: 'read' },
        requiredRoles: ['admin'],
      })
    ).toBe('denied');
  });
  it('denied — role mismatch', () => {
    expect(
      guardOutcomeFor({
        ctx: { principal: 'u', roles: ['viewer'], action: 'read' },
        requiredRoles: ['admin'],
      })
    ).toBe('denied');
  });
  it('errored wins', () => {
    expect(
      guardOutcomeFor({
        ctx: { principal: 'u', roles: ['admin'], action: 'read' },
        requiredRoles: ['admin'],
        errored: true,
      })
    ).toBe('errored');
  });
  it('isAuthorized no required', () => {
    expect(
      isAuthorized({ ctx: { principal: 'u', roles: [], action: 'read' } })
    ).toBe(true);
  });
  it('shouldDeny inverse', () => {
    expect(
      shouldDeny({ ctx: { principal: 'u', roles: ['admin'], action: 'read' }, requiredRoles: ['admin'] })
    ).toBe(false);
  });
});

describe('e2e-guard-smoke.runGuardCase', () => {
  it('allowed pass', async () => {
    const c: IGuardSmokeCase = {
      id: 'a',
      description: 'x',
      ctx: { principal: 'u', roles: ['admin'], action: 'read' },
      requiredRoles: ['admin'],
      expected: 'allowed',
    };
    const r = await runGuardCase({ case: c });
    expect(r.passed).toBe(true);
    expect(r.actual).toBe('allowed');
  });
  it('invalid shape → errored', async () => {
    const c = { id: '', description: '', ctx: undefined as never, expected: 'allowed' };
    const r = await runGuardCase({ case: c });
    expect(r.passed).toBe(false);
    expect(r.actual).toBe('errored');
    expect(r.detail).toContain('id');
  });
  it('executor recorded', async () => {
    const executor: IGuardSmokeExecutor = {
      execute: async () => ({ allowed: true, traceId: 't1', status: 200 }),
    };
    const c: IGuardSmokeCase = {
      id: 'a',
      description: 'x',
      ctx: { principal: 'u', roles: ['admin'], action: 'read' },
      requiredRoles: ['admin'],
      expected: 'allowed',
    };
    const r = await runGuardCase({ case: c, executor });
    expect(r.traceId).toBe('t1');
    expect(r.status).toBe(200);
  });
  it('executor throws → detail', async () => {
    const executor: IGuardSmokeExecutor = {
      execute: async () => {
        throw new Error('boom');
      },
    };
    const c: IGuardSmokeCase = {
      id: 'a',
      description: 'x',
      ctx: { principal: 'u', roles: ['admin'], action: 'read' },
      requiredRoles: ['admin'],
      expected: 'allowed',
    };
    const r = await runGuardCase({ case: c, executor });
    expect(r.detail).toBe('boom');
  });
});

describe('e2e-guard-smoke.runGuardSmoke / cap / passRate / failures', () => {
  it('canonical matrix', async () => {
    const cases = buildCanonicalCases({ fixtureId: 'fx' });
    const report = await runGuardSmoke({ cases });
    expect(report.total).toBe(4);
    expect(report.passed).toBe(4);
  });
  it('cap', () => {
    const c = capGuardCases([{ id: 'a', description: 'x', ctx: undefined as never, expected: 'allowed' }]);
    expect(c.length).toBe(1);
  });
  it('passRate / failures', async () => {
    const cases = buildCanonicalCases({ fixtureId: 'fx' });
    const report = await runGuardSmoke({ cases });
    expect(guardPassRate(report)).toBe(1);
    expect(guardFailures(report).length).toBe(0);
  });
});

describe('e2e-guard-smoke.envelopeForCase / statusForOutcome', () => {
  it('allowed → not_found envelope', () => {
    const c: IGuardSmokeCase = {
      id: 'a',
      description: 'x',
      ctx: { principal: 'u', roles: ['admin'], action: 'read' },
      expected: 'allowed',
    };
    const env = envelopeForCase({ case: c, traceId: 't' });
    expect(env.code).toBe('not_found');
  });
  it('denied — no principal → unauthorized', () => {
    const c: IGuardSmokeCase = {
      id: 'a',
      description: 'x',
      ctx: { principal: null, roles: [], action: 'read' },
      expected: 'denied',
    };
    expect(envelopeForCase({ case: c, traceId: 't' }).code).toBe('unauthorized');
  });
  it('denied — with principal → forbidden', () => {
    const c: IGuardSmokeCase = {
      id: 'a',
      description: 'x',
      ctx: { principal: 'u', roles: ['viewer'], action: 'read' },
      expected: 'denied',
    };
    expect(envelopeForCase({ case: c, traceId: 't' }).code).toBe('forbidden');
  });
  it('errored → internal', () => {
    const c: IGuardSmokeCase = {
      id: 'a',
      description: 'x',
      ctx: { principal: 'u', roles: ['admin'], action: 'admin' },
      expected: 'errored',
    };
    expect(envelopeForCase({ case: c, traceId: 't' }).code).toBe('internal');
  });
  it('statusForOutcome', () => {
    expect(statusForOutcome({ outcome: 'allowed', principal: 'u' })).toBe(200);
    expect(statusForOutcome({ outcome: 'denied', principal: null })).toBe(401);
    expect(statusForOutcome({ outcome: 'denied', principal: 'u' })).toBe(403);
    expect(statusForOutcome({ outcome: 'errored', principal: 'u' })).toBe(500);
  });
});
