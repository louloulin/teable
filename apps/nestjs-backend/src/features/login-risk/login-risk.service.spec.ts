import {
  decideOutcome,
  daysSinceLastSuccess,
  evaluate,
  geoDistanceKm,
  isFailedBurst,
  isImpossibleTravel,
  isKnownDevice,
  isSuspiciousUserAgent,
  pushFingerprint,
  validateFingerprint,
} from './login-risk.service';
import type { ILoginFingerprint, ILoginHistory } from './login-risk.types';
import { MAX_RECENT_FINGERPRINTS } from './login-risk.types';

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
  recent: [baseFp()],
  failedCountByDay: {},
  lastSuccessAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('login-risk.validateFingerprint', () => {
  it('passes', () => {
    expect(validateFingerprint(baseFp())).toBeNull();
  });
  it('rejects missing deviceId', () => {
    expect(validateFingerprint(baseFp({ deviceId: '' }))).toContain('deviceId');
  });
  it('rejects missing ip', () => {
    expect(validateFingerprint(baseFp({ ip: '' }))).toContain('ip');
  });
});

describe('login-risk.isKnownDevice', () => {
  it('true when same', () => {
    expect(isKnownDevice({ fp: baseFp(), history: baseHistory() })).toBe(true);
  });
  it('false when device differs', () => {
    expect(isKnownDevice({ fp: baseFp({ deviceId: 'd2' }), history: baseHistory() })).toBe(false);
  });
});

describe('login-risk.geoDistanceKm / isImpossibleTravel', () => {
  it('same region distance 0', () => {
    expect(geoDistanceKm(baseFp(), baseFp())).toBe(0);
  });
  it('different country large distance', () => {
    expect(
      geoDistanceKm(baseFp({ countryCode: 'US' }), baseFp({ countryCode: 'JP' }))
    ).toBeGreaterThanOrEqual(NEW_LOCATION_DISTANCE_KM);
  });
  it('impossible travel detected', () => {
    expect(
      isImpossibleTravel({
        previous: {
          fingerprint: baseFp({ countryCode: 'US' }),
          occurredAt: '2026-01-01T00:00:00Z',
        },
        current: { fingerprint: baseFp({ countryCode: 'JP' }), occurredAt: '2026-01-01T00:01:00Z' },
      })
    ).toBe(true);
  });
  it('normal travel passes', () => {
    expect(
      isImpossibleTravel({
        previous: {
          fingerprint: baseFp({ countryCode: 'US' }),
          occurredAt: '2026-01-01T00:00:00Z',
        },
        current: { fingerprint: baseFp({ countryCode: 'JP' }), occurredAt: '2026-01-03T00:00:00Z' },
      })
    ).toBe(false);
  });
});

describe('login-risk.isFailedBurst', () => {
  it('false when under cap', () => {
    expect(
      isFailedBurst({
        recentFailed: Array.from({ length: 3 }, () => ({ occurredAt: '2026-01-01T00:00:30Z' })),
        now: '2026-01-01T00:01:00Z',
      })
    ).toBe(false);
  });
  it('true when over cap', () => {
    expect(
      isFailedBurst({
        recentFailed: Array.from({ length: 11 }, () => ({ occurredAt: '2026-01-01T00:00:30Z' })),
        now: '2026-01-01T00:01:00Z',
      })
    ).toBe(true);
  });
});

describe('login-risk.isSuspiciousUserAgent', () => {
  it('flags empty', () => {
    expect(isSuspiciousUserAgent('')).toBe(true);
  });
  it('flags too short', () => {
    expect(isSuspiciousUserAgent('aaa')).toBe(true);
  });
  it('accepts normal', () => {
    expect(isSuspiciousUserAgent('Mozilla/5.0')).toBe(false);
  });
});

describe('login-risk.daysSinceLastSuccess', () => {
  it('null when no history', () => {
    expect(
      daysSinceLastSuccess({
        history: baseHistory({ lastSuccessAt: null }),
        now: '2026-01-02T00:00:00Z',
      })
    ).toBeNull();
  });
  it('counts days', () => {
    expect(
      daysSinceLastSuccess({
        history: baseHistory({ lastSuccessAt: '2026-01-01T00:00:00Z' }),
        now: '2026-01-04T00:00:00Z',
      })
    ).toBe(3);
  });
});

describe('login-risk.evaluate', () => {
  it('clean login returns not anomalous', () => {
    const out = evaluate({
      fingerprint: baseFp(),
      history: baseHistory(),
      recentFailed: [],
      now: '2026-01-02T00:00:00Z',
    });
    expect(out.anomalous).toBe(false);
    expect(out.forceMfa).toBe(false);
  });
  it('new device forces MFA', () => {
    const out = evaluate({
      fingerprint: baseFp({ deviceId: 'd2' }),
      history: baseHistory(),
      recentFailed: [],
      now: '2026-01-02T00:00:00Z',
    });
    expect(out.reasons).toContain('new-device');
    expect(out.forceMfa).toBe(true);
  });
  it('failed burst hard-blocks', () => {
    const failed = Array.from({ length: 11 }, () => ({ occurredAt: '2026-01-01T23:59:30Z' }));
    const out = evaluate({
      fingerprint: baseFp(),
      history: baseHistory(),
      recentFailed: failed,
      now: '2026-01-02T00:00:30Z',
    });
    expect(out.forcedOutcome).toBe('hard-blocked');
    expect(out.reasons).toContain('failed-burst');
  });
});

describe('login-risk.decideOutcome', () => {
  it('forced hard-block wins', () => {
    expect(
      decideOutcome({
        policyAction: null,
        anomaly: { anomalous: true, reasons: [], forcedOutcome: 'hard-blocked', forceMfa: false },
      })
    ).toBe('hard-blocked');
  });
  it('mfa when anomaly demands', () => {
    expect(
      decideOutcome({
        policyAction: null,
        anomaly: { anomalous: true, reasons: [], forcedOutcome: null, forceMfa: true },
      })
    ).toBe('mfa-challenge');
  });
  it('success when clean', () => {
    expect(
      decideOutcome({
        policyAction: null,
        anomaly: { anomalous: false, reasons: [], forcedOutcome: null, forceMfa: false },
      })
    ).toBe('success');
  });
});

describe('login-risk.pushFingerprint', () => {
  it('pushes and trims', () => {
    const history = baseHistory({
      recent: Array.from({ length: MAX_RECENT_FINGERPRINTS }, () => baseFp()),
    });
    const next = pushFingerprint({
      history,
      fp: baseFp({ deviceId: 'd2' }),
      outcome: 'success',
      now: '2026-01-02T00:00:00Z',
    });
    expect(next.recent.length).toBe(MAX_RECENT_FINGERPRINTS);
    expect(next.recent[MAX_RECENT_FINGERPRINTS - 1]?.deviceId).toBe('d2');
    expect(next.lastSuccessAt).toBe('2026-01-02T00:00:00Z');
  });
  it('keeps lastSuccessAt on failed', () => {
    const next = pushFingerprint({
      history: baseHistory(),
      fp: baseFp(),
      outcome: 'failed',
      now: '2026-01-02T00:00:00Z',
    });
    expect(next.lastSuccessAt).toBe('2026-01-01T00:00:00Z');
  });
});

import { NEW_LOCATION_DISTANCE_KM } from './login-risk.types';
