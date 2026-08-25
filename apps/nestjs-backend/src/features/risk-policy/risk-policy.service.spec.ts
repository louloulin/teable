import {
  bandFromScore,
  evaluate,
  isRiskAction,
  isRiskBand,
  isRiskSignalKind,
  maxRulesPerPolicy,
  maxScore,
  maxSignalsPerRule,
  minScore,
  normalizePolicy,
  ruleFires,
  shouldAudit,
  totalWeight,
  validatePolicy,
  validateRule,
  validateSignal,
} from './risk-policy.service';
import type { IRiskPolicy, IRiskRule, IRiskSignal } from './risk-policy.types';
import { MAX_RULES_PER_POLICY, MAX_SIGNALS_PER_RULE, MAX_WEIGHT } from './risk-policy.types';

const baseSignal = (over: Partial<IRiskSignal> = {}): IRiskSignal => ({
  kind: 'login.new-device',
  weight: 10,
  detail: 'unknown device',
  occurredAt: '2026-01-01T00:00:00Z',
  ...over,
});

const baseRule = (over: Partial<IRiskRule> = {}): IRiskRule => ({
  id: 'r1',
  orgId: 'o1',
  name: 'new-device-mfa',
  enabled: true,
  signals: [baseSignal()],
  thresholdBand: 'medium',
  action: 'challenge',
  exemptActorIds: [],
  ...over,
});

const basePolicy = (over: Partial<IRiskPolicy> = {}): IRiskPolicy => ({
  id: 'p1',
  orgId: 'o1',
  defaultAction: 'allow',
  rules: [baseRule()],
  auditAll: true,
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('risk-policy.isRiskBand / Action / SignalKind', () => {
  it('accepts canonical', () => {
    expect(isRiskBand('high')).toBe(true);
    expect(isRiskAction('soft-block')).toBe(true);
    expect(isRiskSignalKind('quota.spike')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isRiskBand('extreme')).toBe(false);
    expect(isRiskAction('quarantine')).toBe(false);
    expect(isRiskSignalKind('bogus')).toBe(false);
  });
});

describe('risk-policy.limits', () => {
  it('returns defaults', () => {
    expect(maxRulesPerPolicy()).toBe(MAX_RULES_PER_POLICY);
    expect(maxSignalsPerRule()).toBe(MAX_SIGNALS_PER_RULE);
    expect(maxScore()).toBe(100);
    expect(minScore()).toBe(0);
  });
});

describe('risk-policy.bandFromScore', () => {
  it('classifies bands', () => {
    expect(bandFromScore(0)).toBe('low');
    expect(bandFromScore(29)).toBe('low');
    expect(bandFromScore(30)).toBe('medium');
    expect(bandFromScore(60)).toBe('high');
    expect(bandFromScore(90)).toBe('critical');
  });
  it('clamps', () => {
    expect(bandFromScore(999)).toBe('critical');
    expect(bandFromScore(-1)).toBe('low');
  });
});

describe('risk-policy.validateSignal / validateRule / validatePolicy', () => {
  it('signal ok', () => {
    expect(validateSignal(baseSignal())).toBeNull();
  });
  it('signal rejects bad kind', () => {
    expect(validateSignal(baseSignal({ kind: 'nope' as never }))).toContain('unknown kind');
  });
  it('signal weight out of range', () => {
    expect(validateSignal(baseSignal({ weight: MAX_WEIGHT + 1 }))).toContain('weight');
    expect(validateSignal(baseSignal({ weight: -1 }))).toContain('weight');
  });
  it('rule rejects unknown band', () => {
    expect(validateRule(baseRule({ thresholdBand: 'extreme' as never }))).toContain(
      'thresholdBand'
    );
  });
  it('rule rejects too many signals', () => {
    const signals = Array.from({ length: MAX_SIGNALS_PER_RULE + 1 }, () => baseSignal());
    expect(validateRule(baseRule({ signals }))).toContain('signals length');
  });
  it('policy ok', () => {
    expect(validatePolicy(basePolicy())).toBeNull();
  });
  it('policy too many rules', () => {
    const rules = Array.from({ length: MAX_RULES_PER_POLICY + 1 }, (_, i) =>
      baseRule({ id: `r${i}` })
    );
    expect(validatePolicy(basePolicy({ rules }))).toContain('rules length');
  });
});

describe('risk-policy.normalizePolicy', () => {
  it('defaults', () => {
    const p = normalizePolicy({ id: 'p1', orgId: 'o1' });
    expect(p.defaultAction).toBe('allow');
    expect(p.auditAll).toBe(true);
    expect(p.rules).toEqual([]);
  });
});

describe('risk-policy.totalWeight / ruleFires', () => {
  it('sums weights', () => {
    expect(
      totalWeight([baseSignal({ weight: 10 }), baseSignal({ weight: 25, kind: 'api.rate-burst' })])
    ).toBe(35);
  });
  it('rule fires when matched above band', () => {
    const r = baseRule({ signals: [baseSignal({ kind: 'login.new-device', weight: 50 })] });
    const out = ruleFires(r, [baseSignal({ kind: 'login.new-device', weight: 50 })]);
    expect(out.fires).toBe(true);
    expect(out.score).toBe(50);
  });
  it('rule does not fire on no match', () => {
    const r = baseRule();
    const out = ruleFires(r, []);
    expect(out.fires).toBe(false);
  });
});

describe('risk-policy.evaluate', () => {
  it('default allow when no rules fire', () => {
    const dec = evaluate({
      policy: basePolicy({ rules: [] }),
      signals: [baseSignal()],
      actorId: 'u1',
    });
    expect(dec.action).toBe('allow');
    expect(dec.band).toBe('low');
    expect(dec.score).toBe(0);
  });
  it('fires challenge for medium', () => {
    const r = baseRule({ signals: [baseSignal({ kind: 'login.new-device', weight: 35 })] });
    const dec = evaluate({
      policy: basePolicy({ rules: [r] }),
      signals: [baseSignal({ kind: 'login.new-device', weight: 35 })],
      actorId: 'u1',
    });
    expect(dec.action).toBe('challenge');
    expect(dec.band).toBe('medium');
  });
  it('hard-block for critical', () => {
    const r = baseRule({ signals: [baseSignal({ kind: 'quota.spike', weight: 95 })] });
    const dec = evaluate({
      policy: basePolicy({ rules: [r] }),
      signals: [baseSignal({ kind: 'quota.spike', weight: 95 })],
      actorId: 'u1',
    });
    expect(dec.action).toBe('hard-block');
    expect(dec.band).toBe('critical');
  });
  it('disabled rules are skipped', () => {
    const r = baseRule({ enabled: false });
    const dec = evaluate({
      policy: basePolicy({ rules: [r] }),
      signals: [baseSignal()],
      actorId: 'u1',
    });
    expect(dec.firedRules).toEqual([]);
  });
  it('exempt actor is skipped', () => {
    const r = baseRule({ exemptActorIds: ['u1'] });
    const dec = evaluate({
      policy: basePolicy({ rules: [r] }),
      signals: [baseSignal()],
      actorId: 'u1',
    });
    expect(dec.firedRules).toEqual([]);
  });
});

describe('risk-policy.shouldAudit', () => {
  it('audits all when auditAll', () => {
    const dec = evaluate({
      policy: basePolicy({ auditAll: true, rules: [] }),
      signals: [],
      actorId: 'u1',
    });
    expect(shouldAudit(dec, basePolicy({ auditAll: true }))).toBe(true);
  });
  it('audits hard-block even when auditAll false', () => {
    const r = baseRule({ signals: [baseSignal({ kind: 'quota.spike', weight: 95 })] });
    const policy = basePolicy({ rules: [r], auditAll: false });
    const dec = evaluate({
      policy,
      signals: [baseSignal({ kind: 'quota.spike', weight: 95 })],
      actorId: 'u1',
    });
    expect(shouldAudit(dec, policy)).toBe(true);
  });
  it('skips audit when allow and not auditAll', () => {
    const policy = basePolicy({ rules: [], auditAll: false });
    const dec = evaluate({ policy, signals: [], actorId: 'u1' });
    expect(shouldAudit(dec, policy)).toBe(false);
  });
});
