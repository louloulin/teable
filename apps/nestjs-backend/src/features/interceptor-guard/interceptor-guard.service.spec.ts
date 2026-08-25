/**
 * Interceptor guard — pure helpers spec (Stage 92).
 */

import {
  buildAudit,
  buildError,
  isAuthorized,
  outcomeFor,
  shouldDeny,
  statusFor,
  validateAuth,
} from './interceptor-guard.service';
import type { IAuthContext } from './interceptor-guard.types';

const baseCtx = (over: Partial<IAuthContext> = {}): IAuthContext => ({
  principal: 'user-1',
  roles: ['member'],
  action: 'read',
  ...over,
});

describe('interceptor-guard.validateAuth', () => {
  it('passes', () => {
    expect(validateAuth(baseCtx())).toBeNull();
  });
  it('rejects unknown action', () => {
    expect(validateAuth(baseCtx({ action: 'wat' as never }))).toContain('unknown action');
  });
});

describe('interceptor-guard.isAuthorized', () => {
  it('anonymous denied', () => {
    expect(
      isAuthorized({ ctx: baseCtx({ principal: null }), requiredRoles: ['member'] })
    ).toBe(false);
  });
  it('role match', () => {
    expect(
      isAuthorized({ ctx: baseCtx({ roles: ['admin', 'member'] }), requiredRoles: ['admin'] })
    ).toBe(true);
  });
  it('role mismatch', () => {
    expect(isAuthorized({ ctx: baseCtx({ roles: ['guest'] }), requiredRoles: ['admin'] })).toBe(
      false
    );
  });
  it('no required roles', () => {
    expect(isAuthorized({ ctx: baseCtx() })).toBe(true);
  });
});

describe('interceptor-guard.buildError', () => {
  it('builds', () => {
    const env = buildError({ code: 'forbidden', message: 'nope', traceId: 'trace-1' });
    expect(env.status).toBe(403);
  });
  it('rejects missing traceId', () => {
    expect(() => buildError({ code: 'forbidden', message: 'nope', traceId: '' })).toThrow();
  });
});

describe('interceptor-guard.statusFor', () => {
  it('maps codes', () => {
    expect(statusFor('unauthorized')).toBe(401);
    expect(statusFor('forbidden')).toBe(403);
    expect(statusFor('rate_limited')).toBe(429);
    expect(statusFor('internal')).toBe(500);
  });
});

describe('interceptor-guard.buildAudit', () => {
  it('builds ok', () => {
    const a = buildAudit({
      ctx: baseCtx({ targetId: 'rec-1' }),
      outcome: 'ok',
      traceId: 't-1',
      now: '2026-08-25T00:00:00.000Z',
      context: { route: '/risk-policies' },
    });
    expect(a.resourceId).toBe('rec-1');
    expect(a.outcome).toBe('ok');
  });
  it('rejects oversized context', () => {
    expect(() =>
      buildAudit({
        ctx: baseCtx(),
        outcome: 'ok',
        traceId: 't-1',
        now: '2026-08-25T00:00:00.000Z',
        context: Object.fromEntries(
          Array.from({ length: 40 }, (_, i) => [`k${i}`, `v${i}`])
        ),
      })
    ).toThrow();
  });
});

describe('interceptor-guard.shouldDeny', () => {
  it('true when not authorized', () => {
    expect(
      shouldDeny({ ctx: baseCtx({ roles: ['guest'] }), requiredRoles: ['admin'] })
    ).toBe(true);
  });
  it('false when authorized', () => {
    expect(shouldDeny({ ctx: baseCtx({ roles: ['admin'] }), requiredRoles: ['admin'] })).toBe(
      false
    );
  });
});

describe('interceptor-guard.outcomeFor', () => {
  it('error', () => {
    expect(outcomeFor({ ctx: baseCtx(), errored: true })).toBe('error');
  });
  it('denied', () => {
    expect(outcomeFor({ ctx: baseCtx({ roles: ['guest'] }), requiredRoles: ['admin'] })).toBe(
      'denied'
    );
  });
  it('ok', () => {
    expect(outcomeFor({ ctx: baseCtx() })).toBe('ok');
  });
});