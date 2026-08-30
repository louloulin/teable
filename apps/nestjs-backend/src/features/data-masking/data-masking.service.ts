/**
 * Data masking — Stage 47.
 *
 * Pure helpers: strategy validation, masking transformations, role
 * eligibility checks. DB-touching work is delegated to
 * DataMaskingAuthService.
 */

import type {
  ICreatePolicyInput,
  IMaskingPolicy,
  IPartialRule,
  IRegexRule,
  MaskingRole,
  MaskingScope,
  MaskingStrategy,
} from './data-masking.types';
import {
  DEFAULT_PARTIAL_KEEP_PREFIX,
  DEFAULT_PARTIAL_KEEP_SUFFIX,
  DEFAULT_PARTIAL_MASK,
  HASH_PREFIX,
} from './data-masking.types';

export function isValidStrategy(s: string): s is MaskingStrategy {
  return (
    s === 'full-redact' ||
    s === 'partial' ||
    s === 'regex' ||
    s === 'hash' ||
    s === 'keep-last' ||
    s === 'email-local' ||
    s === 'phone-tail'
  );
}

export function isValidScope(s: string): s is MaskingScope {
  return s === 'all' || s === 'role-based' || s === 'field-based';
}

export function isValidRole(r: string): r is MaskingRole {
  return r === 'owner' || r === 'creator' || r === 'editor' || r === 'commenter' || r === 'viewer';
}

export function validateCreateInput(input: ICreatePolicyInput): void {
  if (!isValidStrategy(input.strategy)) throw new Error(`invalid strategy: ${input.strategy}`);
  if (!isValidScope(input.scope)) throw new Error(`invalid scope: ${input.scope}`);
  validateRequiredIds(input);
  validateRoleScope(input);
  validateStrategyRules(input);
}

function validateRequiredIds(input: ICreatePolicyInput): void {
  if (!input.baseId || !input.tableId || !input.fieldId) {
    throw new Error('baseId/tableId/fieldId required');
  }
}

function validateRoleScope(input: ICreatePolicyInput): void {
  if (input.scope !== 'role-based') return;
  if (!input.allowedRoles || input.allowedRoles.length === 0) {
    throw new Error('role-based scope requires allowedRoles');
  }
  for (const r of input.allowedRoles) {
    if (!isValidRole(r)) throw new Error(`invalid role: ${r}`);
  }
}

function validateStrategyRules(input: ICreatePolicyInput): void {
  if (input.strategy === 'partial') {
    if (!input.partial) throw new Error('partial strategy requires partial rule');
    validatePartialRule(input.partial);
    return;
  }
  if (input.strategy === 'regex') {
    if (!input.regexRules || input.regexRules.length === 0) {
      throw new Error('regex strategy requires regexRules');
    }
    for (const r of input.regexRules) validateRegexRule(r);
  }
}

export function validatePartialRule(rule: IPartialRule): void {
  if (rule.keepPrefix < 0 || rule.keepSuffix < 0) {
    throw new Error('keepPrefix/keepSuffix must be ≥ 0');
  }
  if (!rule.mask || rule.mask.length === 0) throw new Error('mask must be a non-empty string');
}

export function validateRegexRule(rule: IRegexRule): void {
  if (!rule.pattern) throw new Error('regex pattern required');
  // Throws on invalid pattern.
  new RegExp(rule.pattern);
}

/**
 * Apply a single policy to a value, considering the viewer's role.
 * Returns the masked value when the viewer is NOT allowed to see
 * raw; otherwise returns the original value.
 */
export function applyPolicy(
  policy: IMaskingPolicy,
  value: unknown,
  viewerRole: MaskingRole
): { masked: boolean; value: unknown } {
  if (policy.scope === 'role-based' && policy.allowedRoles.includes(viewerRole)) {
    return { masked: false, value };
  }
  return { masked: true, value: applyStrategy(policy, value) };
}

/** Apply just the transformation (no role check). */
export function applyStrategy(policy: IMaskingPolicy, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  switch (policy.strategy) {
    case 'full-redact':
      return maskFull(value);
    case 'partial':
      return maskPartial(value, policy.partial);
    case 'regex':
      return maskRegex(value, policy.regexRules ?? []);
    case 'hash':
      return maskHash(value);
    case 'keep-last':
      return maskKeepLast(value);
    case 'email-local':
      return maskEmailLocal(value);
    case 'phone-tail':
      return maskPhoneTail(value);
  }
}

function maskFull(v: unknown): string {
  const s = String(v);
  if (s.length === 0) return '';
  return '*'.repeat(Math.min(s.length, 8));
}

function maskPartial(v: unknown, rule?: IPartialRule): string {
  const s = String(v);
  const r: IPartialRule = rule ?? {
    keepPrefix: DEFAULT_PARTIAL_KEEP_PREFIX,
    keepSuffix: DEFAULT_PARTIAL_KEEP_SUFFIX,
    mask: DEFAULT_PARTIAL_MASK,
  };
  if (s.length <= r.keepPrefix + r.keepSuffix) return r.mask.repeat(s.length || 1);
  const pre = s.slice(0, r.keepPrefix);
  const suf = s.slice(s.length - r.keepSuffix);
  const mid = r.mask.repeat(Math.max(1, s.length - r.keepPrefix - r.keepSuffix));
  return pre + mid + suf;
}

function maskRegex(v: unknown, rules: IRegexRule[]): string {
  let s = String(v);
  for (const r of rules) {
    s = s.replace(new RegExp(r.pattern, 'g'), r.replacement);
  }
  return s;
}

function maskHash(v: unknown): string {
  const s = String(v);
  // djb2-like deterministic non-cryptographic hash. Stage 47 keeps it
  // intentionally light; Stage 50 may swap to KMS-backed HMAC.
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return `${HASH_PREFIX}${h.toString(36)}`;
}

function maskKeepLast(v: unknown): string {
  const s = String(v);
  if (s.length <= 4) return '*'.repeat(s.length);
  return '*'.repeat(s.length - 4) + s.slice(-4);
}

function maskEmailLocal(v: unknown): string {
  const s = String(v);
  const at = s.indexOf('@');
  if (at <= 0) return maskFull(s);
  const local = s.slice(0, at);
  const domain = s.slice(at);
  const maskedLocal = local.length <= 2 ? '**' : `${local[0]}***${local[local.length - 1]}`;
  return `${maskedLocal}${domain}`;
}

function maskPhoneTail(v: unknown): string {
  const s = String(v).replace(/\D+/g, '');
  if (s.length <= 4) return '*'.repeat(s.length);
  return `***-***-${s.slice(-4)}`;
}

/** Apply a list of policies in order. */
export function applyPolicies(
  policies: ReadonlyArray<IMaskingPolicy>,
  values: Record<string, unknown>,
  viewerRole: MaskingRole
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const p of policies) {
    if (!(p.fieldId in out)) continue;
    const r = applyPolicy(p, out[p.fieldId], viewerRole);
    out[p.fieldId] = r.value;
  }
  return out;
}

/** True if the viewer role may see raw values for this policy. */
export function viewerMaySee(policy: IMaskingPolicy, viewerRole: MaskingRole): boolean {
  if (policy.scope === 'all') return false;
  if (policy.scope === 'role-based') return policy.allowedRoles.includes(viewerRole);
  return false;
}
