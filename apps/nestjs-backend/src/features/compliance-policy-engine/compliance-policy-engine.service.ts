/**
 * Compliance Policy Engine — pure helpers (Stage 126).
 */

import {
  DEFAULT_POLICY_BUNDLE_VERSION,
  PolicyBundle,
  PolicyContext,
  PolicyEvalResult,
  PolicyRule,
  PolicySeverity,
  PolicyViolation,
  SEVERITY_RANK,
} from './compliance-policy-engine.types';

function hashStr(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(16).padStart(8, '0').slice(0, 8);
}

/** Built-in starter rule set. */
export const BUILTIN_POLICIES: readonly PolicyRule[] = [
  { id: 'pol_mfa_required', title: 'MFA required', description: 'All users must have MFA enabled.', severity: 'block', actions: ['audit', 'block'] },
  { id: 'pol_password_rotation', title: 'Password rotation', description: 'Passwords must be rotated within 180 days.', severity: 'warn', actions: ['notify'], threshold: 180 },
  { id: 'pol_unused_keys', title: 'Unused API keys', description: 'API keys unused for 90 days must be revoked.', severity: 'warn', actions: ['notify'], threshold: 90 },
  { id: 'pol_data_residency', title: 'Data residency', description: 'Customer data must reside in selected region.', severity: 'block', actions: ['audit', 'block'] },
  { id: 'pol_log_retention', title: 'Log retention', description: 'Audit logs must be retained per policy.', severity: 'warn', actions: ['log'], threshold: 365 },
];

/** Build a stable rule id from title. */
export function buildRuleId(title: string): string {
  return `pol_${hashStr(title.toLowerCase())}`;
}

/** Validate rule id format. */
export function isRuleIdValid(id: string): boolean {
  return /^pol_[a-z0-9]{8,}$/.test(id);
}

/** Build a policy bundle from rules + version. */
export function buildBundle(rules: readonly PolicyRule[], version: string = DEFAULT_POLICY_BUNDLE_VERSION): PolicyBundle {
  return { version, rules };
}

/** Find rule by id. */
export function findRule(bundle: PolicyBundle, id: string): PolicyRule | undefined {
  return bundle.rules.find((r) => r.id === id);
}

/** Filter rules by severity. */
export function filterBySeverity(bundle: PolicyBundle, severity: PolicySeverity): PolicyRule[] {
  return bundle.rules.filter((r) => r.severity === severity);
}

/** Validate a single rule (basic shape). */
export function isRuleValid(rule: PolicyRule): boolean {
  return !!rule.id && !!rule.title && !!rule.description && SEVERITY_RANK[rule.severity] !== undefined;
}

/** Evaluate a context against a bundle. */
export function evaluateBundle(bundle: PolicyBundle, ctx: PolicyContext, now: string = new Date().toISOString()): PolicyEvalResult {
  const violations: PolicyViolation[] = [];
  for (const r of bundle.rules) {
    const v = evaluateRule(r, ctx, now);
    if (v) violations.push(v);
  }
  const passed = !violations.some((v) => v.severity === 'block');
  return { passed, violations, evaluatedAt: now };
}

/** Evaluate a single rule against context. */
export function evaluateRule(rule: PolicyRule, ctx: PolicyContext, now: string = new Date().toISOString()): PolicyViolation | undefined {
  const state = ctx.state;
  switch (rule.id) {
    case 'pol_mfa_required':
      if (state.hasMfa !== true) {
        return makeViolation(rule, 'MFA is not enabled.', now);
      }
      return undefined;
    case 'pol_password_rotation':
      if (typeof state.passwordAgeDays === 'number' && rule.threshold !== undefined && state.passwordAgeDays > rule.threshold) {
        return makeViolation(rule, `Password age ${state.passwordAgeDays} > ${rule.threshold} days.`, now);
      }
      return undefined;
    case 'pol_unused_keys':
      if (typeof state.unusedKeyDays === 'number' && rule.threshold !== undefined && state.unusedKeyDays > rule.threshold) {
        return makeViolation(rule, `Unused API key age ${state.unusedKeyDays} > ${rule.threshold} days.`, now);
      }
      return undefined;
    case 'pol_data_residency':
      if (state.dataRegion !== undefined && ctx.meta?.region !== undefined && state.dataRegion !== ctx.meta.region) {
        return makeViolation(rule, `Data region ${state.dataRegion} does not match workspace region ${ctx.meta.region}.`, now);
      }
      return undefined;
    case 'pol_log_retention':
      if (typeof state.logRetentionDays === 'number' && rule.threshold !== undefined && state.logRetentionDays < rule.threshold) {
        return makeViolation(rule, `Log retention ${state.logRetentionDays} < required ${rule.threshold}.`, now);
      }
      return undefined;
    default:
      return undefined;
  }
}

function makeViolation(rule: PolicyRule, message: string, now: string): PolicyViolation {
  return { ruleId: rule.id, severity: rule.severity, message, detectedAt: now };
}

/** Decide whether to block based on result. */
export function shouldBlock(result: PolicyEvalResult): boolean {
  return !result.passed;
}

/** Filter violations by severity. */
export function filterViolations(result: PolicyEvalResult, severity: PolicySeverity): PolicyViolation[] {
  return result.violations.filter((v) => v.severity === severity);
}

/** Highest severity among violations. */
export function maxSeverity(violations: readonly PolicyViolation[]): PolicySeverity | undefined {
  if (!violations.length) return undefined;
  return violations.reduce<PolicySeverity>(
    (m, v) => (SEVERITY_RANK[v.severity] > SEVERITY_RANK[m] ? v.severity : m),
    'info'
  );
}

/** Build the actions for a violation (from rule.actions). */
export function actionsForViolation(result: PolicyEvalResult, ruleId: string, bundle: PolicyBundle): readonly PolicyRule['actions'][number][] {
  const v = result.violations.find((x) => x.ruleId === ruleId);
  if (!v) return [];
  const r = findRule(bundle, ruleId);
  return r?.actions ?? [];
}

/** Stable hash of the bundle (used for version pinning). */
export function bundleHash(bundle: PolicyBundle): string {
  return hashStr(bundle.rules.map((r) => r.id).sort().join('|') + ':' + bundle.version);
}
