/**
 * Compliance Policy Engine — NestJS auth service spec (Stage 126).
 */

import { CompliancePolicyEngineAuthService } from './compliance-policy-engine.auth.service';
import { PolicyRule } from './compliance-policy-engine.types';

interface IPrismaMock { $queryRaw: (template: TemplateStringsArray) => Promise<unknown>; }
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() { return new CompliancePolicyEngineAuthService(makePrisma() as never); }
function r(): PolicyRule { return { id: 'pol_mfa_required', title: 'MFA', description: 'd', severity: 'block', actions: ['block'] }; }

describe('CompliancePolicyEngineAuthService.builtin / buildId / validId / validRule', () => {
  it('builtin', () => { expect(setup().builtin().length).toBeGreaterThan(0); });
  it('buildId', () => { expect(setup().buildId('mfa required')).toMatch(/^pol_/); });
  it('validId', () => { expect(setup().validId('pol_abcdef12')).toBe(true); expect(setup().validId('bad')).toBe(false); });
  it('validRule', () => { expect(setup().validRule(r())).toBe(true); });
});

describe('CompliancePolicyEngineAuthService.bundle / find / bySeverity / evaluate', () => {
  it('bundle', () => { expect(setup().bundle(setup().builtin()).rules.length).toBeGreaterThan(0); });
  it('find', () => { expect(setup().find(setup().bundle(setup().builtin()), 'pol_mfa_required')?.title).toBe('MFA required'); });
  it('bySeverity', () => { expect(setup().bySeverity(setup().bundle(setup().builtin()), 'block').length).toBeGreaterThan(0); });
  it('evaluate', () => { expect(setup().evaluate(setup().bundle(setup().builtin()), { state: { hasMfa: false } }, '2026-08-25').passed).toBe(false); });
  it('evalRule', () => { expect(setup().evalRule(r(), { state: { hasMfa: false } }, '2026-08-25')).toBeDefined(); });
});

describe('CompliancePolicyEngineAuthService.block / filterViolations / worst / actionsFor / hash / ping', () => {
  const svc = setup();
  const bundle = svc.bundle(svc.builtin());
  const result = svc.evaluate(bundle, { state: { hasMfa: false } }, '2026-08-25');

  it('block', () => { expect(svc.block(result)).toBe(true); });
  it('filter', () => { expect(svc.filterViolations(result, 'block').length).toBeGreaterThan(0); });
  it('worst', () => { expect(svc.worst(result.violations)).toBe('block'); });
  it('actionsFor', () => { expect(svc.actionsFor(result, 'pol_mfa_required', bundle).length).toBeGreaterThan(0); });
  it('hash', () => { expect(svc.hash(bundle).length).toBeGreaterThan(0); });
  it('ping', async () => { expect(await svc.ping()).toBe(true); });
});