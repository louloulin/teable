/**
 * Login risk NestJS auth service — persistence is mocked.
 */

import { LoginRiskAuthService } from './login-risk.auth.service';
import type { ILoginAttempt, ILoginFingerprint, ILoginHistory } from './login-risk.types';

interface IPrismaMock {
  loginAttempt: {
    create: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown[]>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    loginAttempt: {
      create: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

const baseFp = (over: Partial<ILoginFingerprint> = {}): ILoginFingerprint => ({
  deviceId: 'd1',
  ip: '1.2.3.4',
  countryCode: 'US',
  regionCode: 'CA',
  tzOffsetMinutes: -480,
  userAgent: 'Mozilla/5.0',
  ...over,
});

const baseHistory = (over: Partial<ILoginHistory> = {}): ILoginHistory => ({
  actorId: 'u1',
  recent: [],
  failedCountByDay: {},
  lastSuccessAt: null,
  ...over,
});

const baseAttempt = (over: Partial<ILoginAttempt> = {}): ILoginAttempt => ({
  id: 'a1',
  orgId: 'o1',
  actorId: 'u1',
  fingerprint: baseFp(),
  outcome: 'success',
  band: 'low',
  occurredAt: '2026-01-01T00:00:00Z',
  failureReason: null,
  ...over,
});

describe('LoginRiskAuthService.evaluate / decideOutcome', () => {
  it('evaluates and decides', () => {
    const svc = new LoginRiskAuthService(makePrisma() as never);
    const anomaly = svc.evaluate({
      fingerprint: baseFp(),
      history: baseHistory(),
      recentFailed: [],
      now: '2026-01-01T00:00:00Z',
    });
    expect(svc.decideOutcome({ policyAction: null, anomaly })).toBe('success');
  });
});

describe('LoginRiskAuthService.recordAttempt', () => {
  it('persists attempt and pushes history', async () => {
    const prisma = makePrisma();
    const svc = new LoginRiskAuthService(prisma as never);
    const next = await svc.recordAttempt({
      attempt: baseAttempt(),
      history: baseHistory(),
    });
    expect(next.recent.length).toBe(1);
    expect(next.lastSuccessAt).toBe('2026-01-01T00:00:00Z');
    expect(prisma.loginAttempt.create).toHaveBeenCalledTimes(1);
  });
});

describe('LoginRiskAuthService.loadHistory', () => {
  it('rebuilds from rows', async () => {
    const prisma = makePrisma();
    (prisma.loginAttempt.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        deviceId: 'd1',
        ip: '1.2.3.4',
        countryCode: 'US',
        regionCode: 'CA',
        tzOffsetMinutes: -480,
        userAgent: 'Mozilla/5.0',
        outcome: 'success',
        occurredAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new LoginRiskAuthService(prisma as never);
    const h = await svc.loadHistory('u1');
    expect(h.recent.length).toBe(1);
    expect(h.lastSuccessAt?.startsWith('2026-01-01T00:00:00')).toBe(true);
  });
});
