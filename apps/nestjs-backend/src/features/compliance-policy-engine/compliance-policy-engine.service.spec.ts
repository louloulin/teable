/**
 * Compliance Policy Engine — pure helpers spec (Stage 126).
 */

import {
  BUILTIN_POLICIES,
  actionsForViolation,
  buildBundle,
  buildRuleId,
  bundleHash,
  evaluateBundle,
  evaluateRule,
  filterBySeverity,
  filterViolations,
  findRule,
  isRuleIdValid,
  isRuleValid,
  maxSeverity,
  shouldBlock,
} from './compliance-policy-engine.service';
import { PolicyRule } from './compliance-policy-engine.types';

function r(over: Partial = {}): PolicyRule {
  return { id: 'pol_aaaa0001', title: 'Test', description: 'd', severity: 'warn', actions: ['log'], ...over };
}

describe('compliance-policy-engine.buildRuleId / isRuleIdValid', () => {
  it('build', () => { expect(buildRuleId('mfa required')).toMatch(/^pol_/); });
  it('valid', () => { expect(isRuleIdValid('pol_abcdef12')).toBe(true); expect(isRuleIdValid('bad')).toBe(false); });
});

describe('compliance-policy-engine.buildBundle / findRule / filterBySeverity', () => {
  const bundle = buildBundle(BUILTIN_POLICIES, '1.0.0');
  it('version', () => { expect(bundle.version).toBe('1.0.0'); });
  it('find', () => { expect(findRule(bundle, 'pol_mfa_required')?.title).toBe('MFA required'); });
  it('filter', () => { expect(filterBySeverity(bundle, 'block').length).toBeGreaterThan(0); });
});

describe('compliance-policy-engine.isRuleValid', () => {
  it('valid', () => { expect(isRuleValid(r())).toBe(true); });
  it('empty title', () => { expect(isRuleValid(r({ title: '' }))).toBe(false); });
});

describe('compliance-policy-engine.evaluateRule (builtin)', () => {
  it('mfa missing', () => {
    const rule = BUILTIN_POLICIES.find((x) => x.id === 'pol_mfa_required')!;
    expect(evaluateRule(rule, { state: { hasMfa: false } })?.ruleId).toBe('pol_mfa_required');
  });
  it('mfa ok', () => {
    const rule = BUILTIN_POLICIES.find((x) => x.id === 'pol_mfa_required')!;
    expect(evaluateRule(rule, { state: { hasMfa: true } })).toBeUndefined();
  });
  it('password rotation overdue', () => {
    const rule = BUILTIN_POLICIES.find((x) => x.id === 'pol_password_rotation')!;
    expect(evaluateRule(rule, { state: { passwordAgeDays: 200 } })).toBeDefined();
  });
  it('unused keys', () => {
    const rule = BUILTIN_POLICIES.find((x) => x.id === 'pol_unused_keys')!;
    expect(evaluateRule(rule, { state: { unusedKeyDays: 100 } })).toBeDefined();
  });
  it('data residency mismatch', () => {
    const rule = BUILTIN_POLICIES.find((x) => x.id === 'pol_data_residency')!;
    expect(evaluateRule(rule, { state: { dataRegion: 'us' }, meta: { region: 'eu' } })).toBeDefined();
  });
  it('log retention too short', () => {
    const rule = BUILTIN_POLICIES.find((x) => x.id === 'pol_log_retention')!;
    expect(evaluateRule(rule, { state: { logRetentionDays: 30 } })).toBeDefined();
  });
});

describe('compliance-policy-engine.evaluateBundle', () => {
  it('passes', () => {
    const bundle = buildBundle(BUILTIN_POLICIES);
    expect(evaluateBundle(bundle, { state: { hasMfa: true, passwordAgeDays: 30, unusedKeyDays: 10, logRetentionDays: 365 }, meta: { region: 'us' } }, '2026-08-25').passed).toBe(true);
  });
  it('fails (block)', () => {
    const bundle = buildBundle(BUILTIN_POLICIES);
    expect(evaluateBundle(bundle, { state: { hasMfa: false } }, '2026-08-25').passed).toBe(false);
  });
});

describe('compliance-policy-engine.shouldBlock / filterViolations / maxSeverity', () => {
  it('block', () => {
    const r = evaluateBundle(buildBundle(BUILTIN_POLICIES), { state: { hasMfa: false } }, '2026-08-25');
    expect(shouldBlock(r)).toBe(true);
  });
  it('filter', () => {
    const r = evaluateBundle(buildBundle(BUILTIN_POLICIES), { state: { hasMfa: false } }, '2026-08-25');
    expect(filterViolations(r, 'block').length).toBeGreaterThan(0);
  });
  it('max', () => {
    expect(maxSeverity([{ ruleId: 'x', severity: 'block', message: 'm', detectedAt: 't' }])).toBe('block');
    expect(maxSeverity([])).toBeUndefined();
  });
});

describe('compliance-policy-engine.actionsForViolation / bundleHash', () => {
  it('actions', () => {
    const bundle = buildBundle(BUILTIN_POLICIES);
    const r = evaluateBundle(bundle, { state: { hasMfa: false } }, '2026-08-25');
    expect(actionsForViolation(r, 'pol_mfa_required', bundle).length).toBeGreaterThan(0);
  });
  it('hash stable', () => {
    const b = buildBundle(BUILTIN_POLICIES, '1.0.0');
    expect(bundleHash(b)).toBe(bundleHash(b));
  });
});