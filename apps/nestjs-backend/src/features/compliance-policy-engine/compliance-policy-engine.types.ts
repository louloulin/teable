/**
 * Compliance Policy Engine — types (Stage 126).
 *
 * Declarative policy enforcement with violation detection + alerting.
 */

export type PolicySeverity = 'info' | 'warn' | 'block';
export type PolicyAction = 'log' | 'notify' | 'block' | 'audit';

export interface PolicyRule {
  /** Unique rule id. */
  id: string;
  /** Human title. */
  title: string;
  /** Description / expected behavior. */
  description: string;
  /** Severity when violated. */
  severity: PolicySeverity;
  /** Actions to take on violation. */
  actions: readonly PolicyAction[];
  /** Optional limit / threshold. */
  threshold?: number;
}

export interface PolicyContext {
  /** Current state (e.g. { hasMfa: true, passwordAgeDays: 5 }). */
  state: Record<string, unknown>;
  /** Optional metadata (user id, workspace id, ...). */
  meta?: Record<string, string>;
}

export interface PolicyViolation {
  ruleId: string;
  severity: PolicySeverity;
  message: string;
  detectedAt: string;
}

export interface PolicyEvalResult {
  passed: boolean;
  violations: readonly PolicyViolation[];
  evaluatedAt: string;
}

export interface PolicyBundle {
  version: string;
  rules: readonly PolicyRule[];
}

export const POLICY_RULE_ID_RE = /^pol_[a-z0-9]{8,}$/;
export const DEFAULT_POLICY_BUNDLE_VERSION = '1.0.0';
export const SEVERITY_RANK: Readonly<Record<PolicySeverity, number>> = { info: 0, warn: 1, block: 2 };