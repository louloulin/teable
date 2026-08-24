import type { ExecutionContext } from '@nestjs/common';
import { HttpStatus } from '@nestjs/common';
import { HttpErrorCode } from '@teable/core';
import type { PlanLevel } from '@teable/db-main-prisma';
import { describe, expect, it, vi } from 'vitest';

import { CustomHttpException } from '../../custom.exception';
import { ApiThrottleGuard } from './api-rate-limit.guard';

class StubLicenseCapabilityService {
  private plan: PlanLevel;
  constructor(plan: PlanLevel = 'self_hosted') {
    this.plan = plan;
  }
  setPlan(plan: PlanLevel): void {
    this.plan = plan;
  }
  currentPlan(): PlanLevel {
    return this.plan;
  }
}

interface IReqOverrides {
  ip?: string;
  socket?: { remoteAddress?: string } | null;
  connection?: { remoteAddress?: string } | null;
}

const buildCtx = (overrides: IReqOverrides = {}): ExecutionContext => {
  const req: Record<string, unknown> = {};
  if (overrides.ip !== undefined) req.ip = overrides.ip;
  req.socket = overrides.socket === undefined ? { remoteAddress: '127.0.0.1' } : overrides.socket;
  req.connection = overrides.connection === null ? null : overrides.connection;
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({}),
      getNext: () => () => undefined,
    }),
  } as unknown as ExecutionContext;
};

describe('ApiThrottleGuard', () => {
  // AC-001: self_hosted plan is a hard opt-out.
  it('does not throttle or bucket under self_hosted (AC-001)', () => {
    const caps = new StubLicenseCapabilityService('self_hosted');
    const guard = new ApiThrottleGuard(
      caps as unknown as ConstructorParameters<typeof ApiThrottleGuard>[0]
    );

    for (let i = 0; i < 100; i++) {
      expect(guard.canActivate(buildCtx({ ip: '1.2.3.4' }))).toBe(true);
    }

    // Bucket map must remain empty for that IP — the guard should have
    // short-circuited before touching it.
    expect((guard as unknown as { buckets: Map<string, unknown> }).buckets.size).toBe(0);
  });

  // AC-002: business plan caps at 10 req/s; the 11th request 429s.
  it('returns 429 on the 11th request within the same window under business (AC-002)', () => {
    const caps = new StubLicenseCapabilityService('business');
    const guard = new ApiThrottleGuard(
      caps as unknown as ConstructorParameters<typeof ApiThrottleGuard>[0]
    );

    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(buildCtx({ ip: '1.2.3.4' }))).toBe(true);
    }

    let caught: unknown;
    try {
      guard.canActivate(buildCtx({ ip: '1.2.3.4' }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CustomHttpException);
    const ex = caught as CustomHttpException;
    expect(ex.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(ex.code).toBe(HttpErrorCode.TOO_MANY_REQUESTS);
  });

  // AC-003: independent IPs do not share the bucket.
  it('tracks each IP independently (AC-003)', () => {
    const caps = new StubLicenseCapabilityService('business');
    const guard = new ApiThrottleGuard(
      caps as unknown as ConstructorParameters<typeof ApiThrottleGuard>[0]
    );

    // Burn through 10 requests for IP A — all allowed, 11th rejected.
    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(buildCtx({ ip: '10.0.0.1' }))).toBe(true);
    }
    expect(() => guard.canActivate(buildCtx({ ip: '10.0.0.1' }))).toThrow(CustomHttpException);

    // IP B should still be at zero.
    expect(guard.canActivate(buildCtx({ ip: '10.0.0.2' }))).toBe(true);
    // And burning IP B up to its own cap is independent of A.
    for (let i = 0; i < 9; i++) {
      expect(guard.canActivate(buildCtx({ ip: '10.0.0.2' }))).toBe(true);
    }
    expect(() => guard.canActivate(buildCtx({ ip: '10.0.0.2' }))).toThrow(CustomHttpException);
  });

  // AC-004: switching plan to self_hosted immediately disables throttle.
  it('stops throttling the moment the plan flips to self_hosted (AC-004)', () => {
    const caps = new StubLicenseCapabilityService('business');
    const guard = new ApiThrottleGuard(
      caps as unknown as ConstructorParameters<typeof ApiThrottleGuard>[0]
    );

    for (let i = 0; i < 11; i++) {
      try {
        guard.canActivate(buildCtx({ ip: '5.5.5.5' }));
      } catch {
        // expected on i === 10
      }
    }

    // Plan flips to self_hosted; bucket is ignored from this point on,
    // even though we just left a filled bucket behind for the same IP.
    caps.setPlan('self_hosted');
    expect(guard.canActivate(buildCtx({ ip: '5.5.5.5' }))).toBe(true);
    expect(guard.canActivate(buildCtx({ ip: '5.5.5.5' }))).toBe(true);
    expect(guard.canActivate(buildCtx({ ip: '5.5.5.5' }))).toBe(true);
  });

  // Bonus: clock-driven window rotation so the spec is not flaky under
  // slow CI. This keeps AC-002 honest across machines.
  it('resets the bucket once a full window has elapsed', () => {
    vi.useFakeTimers();
    try {
      const caps = new StubLicenseCapabilityService('business');
      const guard = new ApiThrottleGuard(
        caps as unknown as ConstructorParameters<typeof ApiThrottleGuard>[0]
      );

      const start = Date.now();
      vi.setSystemTime(start);
      for (let i = 0; i < 10; i++) {
        expect(guard.canActivate(buildCtx({ ip: '7.7.7.7' }))).toBe(true);
      }
      expect(() => guard.canActivate(buildCtx({ ip: '7.7.7.7' }))).toThrow(CustomHttpException);

      // Advance past the window.
      vi.setSystemTime(start + 1500);
      expect(guard.canActivate(buildCtx({ ip: '7.7.7.7' }))).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
