import {
  aggregateUsage,
  applyGrant,
  applyOptions,
  buildOverage,
  computeRemaining,
  decideQuota,
  decayFairness,
  emptyFairnessState,
  normalizeEnvelope,
  pickNextBase,
  validateEnvelope,
} from './org-quota.service';
import type { IFairnessState, IOrgQuotaEnvelope, IOrgQuotaUsage } from './org-quota.types';

const baseEnvelope = (over: Partial<IOrgQuotaEnvelope> = {}): IOrgQuotaEnvelope => ({
  orgId: 'org1',
  caps: { rows: 1000, aiCredits: 500 },
  policy: 'soft',
  softFraction: 0.8,
  windowSeconds: 3600,
  ...over,
});

const baseUsage = (over: Partial<IOrgQuotaUsage> = {}): IOrgQuotaUsage => ({
  orgId: 'org1',
  kind: 'rows',
  used: 100,
  cap: 1000,
  windowStart: '2026-01-01T00:00:00Z',
  windowEnd: '2026-01-01T01:00:00Z',
  ...over,
});

describe('org-quota.normalizeEnvelope', () => {
  it('drops unknown kinds', () => {
    const env = normalizeEnvelope({
      ...baseEnvelope(),
      caps: { rows: 100, bogus: 5 } as IOrgQuotaEnvelope['caps'],
    });
    expect(env.caps.rows).toBe(100);
    expect((env.caps as Record<string, unknown>).bogus).toBeUndefined();
  });
  it('clamps softFraction to (0, 1)', () => {
    expect(normalizeEnvelope({ ...baseEnvelope(), softFraction: 0 }).softFraction).toBe(0);
    expect(normalizeEnvelope({ ...baseEnvelope(), softFraction: 1 }).softFraction).toBe(0.99);
    expect(normalizeEnvelope({ ...baseEnvelope(), softFraction: 0.5 }).softFraction).toBe(0.5);
  });
  it('preserves null cap as unlimited', () => {
    const env = normalizeEnvelope({ ...baseEnvelope(), caps: { rows: null } });
    expect(env.caps.rows).toBeNull();
  });
});

describe('org-quota.validateEnvelope', () => {
  it('passes a healthy envelope', () => {
    expect(validateEnvelope(baseEnvelope())).toEqual([]);
  });
  it('flags missing orgId', () => {
    expect(validateEnvelope({ ...baseEnvelope(), orgId: '' }).join(' ')).toContain('orgId');
  });
  it('flags unknown policy', () => {
    expect(
      validateEnvelope({
        ...baseEnvelope(),
        policy: 'surprise' as IOrgQuotaEnvelope['policy'],
      }).join(' ')
    ).toContain('unknown policy');
  });
  it('flags invalid windowSeconds', () => {
    expect(validateEnvelope({ ...baseEnvelope(), windowSeconds: 0 }).join(' ')).toContain(
      'windowSeconds'
    );
  });
});

describe('org-quota.computeRemaining', () => {
  it('returns null when cap is null', () => {
    expect(computeRemaining(null, 100)).toBeNull();
  });
  it('returns 0 when used exceeds cap', () => {
    expect(computeRemaining(100, 200)).toBe(0n);
  });
  it('returns the difference otherwise', () => {
    expect(computeRemaining(100, 30)).toBe(70n);
  });
});

describe('org-quota.decideQuota', () => {
  it('allow when cap is null', () => {
    const r = decideQuota({
      envelope: { ...baseEnvelope({ caps: { rows: null } }) },
      usage: baseUsage(),
      requested: 100,
    });
    expect(r.decision).toBe('allow');
    expect(r.remaining).toBeNull();
  });
  it('allow under cap', () => {
    const r = decideQuota({ envelope: baseEnvelope(), usage: baseUsage(), requested: 100 });
    expect(r.decision).toBe('allow');
  });
  it('hard policy denies at cap', () => {
    const env = baseEnvelope({ policy: 'hard' });
    const r = decideQuota({ envelope: env, usage: baseUsage({ used: 1000 }), requested: 1 });
    expect(r.decision).toBe('deny');
    expect(r.atCap).toBe(true);
  });
  it('soft policy throttles between soft band and 100%', () => {
    const env = baseEnvelope({ policy: 'soft', softFraction: 0.8 });
    const r = decideQuota({
      envelope: env,
      usage: baseUsage({ used: 850 }),
      requested: 200,
    });
    expect(r.decision).toBe('throttle');
  });
  it('soft policy throttles above 100%', () => {
    const env = baseEnvelope({ policy: 'soft', softFraction: 0.8 });
    const r = decideQuota({
      envelope: env,
      usage: baseUsage({ used: 1100 }),
      requested: 10,
    });
    expect(r.decision).toBe('throttle');
  });
  it('queue policy queues above cap', () => {
    const env = baseEnvelope({ policy: 'queue' });
    const r = decideQuota({
      envelope: env,
      usage: baseUsage({ used: 1100 }),
      requested: 10,
    });
    expect(r.decision).toBe('queue');
  });
});

describe('org-quota.buildOverage', () => {
  it('captures the policy name in the reason', () => {
    const event = buildOverage({
      envelope: baseEnvelope({ policy: 'queue' }),
      baseId: 'b1',
      kind: 'rows',
      requested: 100,
      decision: 'queue',
    });
    expect(event.reason).toContain('queued');
    expect(event.decision).toBe('queue');
  });
});

describe('org-quota.fairness', () => {
  it('pickNextBase picks the most-starved base', () => {
    const state: IFairnessState = {
      orgId: 'org1',
      deficits: { a: 1, b: 5, c: 0 },
      lastGrantByBase: {
        a: new Date(Date.now() - 1_000).toISOString(),
        b: new Date(Date.now() - 1_000).toISOString(),
      },
      totalGrants: 0,
    };
    expect(pickNextBase(state, ['a', 'b', 'c'])).toBe('b');
  });
  it('pickNextBase returns null with no candidates', () => {
    expect(pickNextBase(emptyFairnessState('org1'), [])).toBeNull();
  });
  it('applyGrant resets deficit on allow', () => {
    const s = applyGrant({
      state: { ...emptyFairnessState('org1'), deficits: { a: 5 } },
      baseId: 'a',
      decision: 'allow',
      units: 1,
    });
    expect(s.deficits.a).toBe(0);
    expect(s.totalGrants).toBe(1);
  });
  it('applyGrant accumulates deficit on deny', () => {
    const s = applyGrant({
      state: emptyFairnessState('org1'),
      baseId: 'a',
      decision: 'deny',
      units: 3,
    });
    expect(s.deficits.a).toBe(3);
  });
  it('decayFairness decays old deficits', () => {
    const state: IFairnessState = {
      orgId: 'org1',
      deficits: { a: 10 },
      lastGrantByBase: { a: new Date(Date.now() - 60_000).toISOString() },
      totalGrants: 1,
    };
    const decayed = decayFairness(state);
    expect(decayed.deficits.a).toBeLessThan(10);
  });
  it('applyOptions filters to candidate bases', () => {
    const state: IFairnessState = {
      orgId: 'org1',
      deficits: { a: 1, b: 2, c: 3 },
      lastGrantByBase: {},
      totalGrants: 0,
    };
    const filtered = applyOptions(state, { candidateBaseIds: ['a', 'b'] });
    expect(filtered.deficits.c).toBeUndefined();
  });
});

describe('org-quota.aggregateUsage', () => {
  it('sums per-base usage', () => {
    const u = aggregateUsage({
      orgId: 'org1',
      kind: 'rows',
      perBaseUsed: [
        { baseId: 'a', used: 100 },
        { baseId: 'b', used: 50 },
      ],
      windowStart: '2026-01-01T00:00:00Z',
      windowEnd: '2026-01-01T01:00:00Z',
    });
    expect(u.used).toBe(150);
  });
});
