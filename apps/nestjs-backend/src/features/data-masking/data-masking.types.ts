/**
 * Data masking — Stage 47.
 *
 * A `MaskingPolicy` declares which field types get masked and how.
 * A `MaskingRule` is the per-rule primitive (regex/format/keep-tail/etc.).
 * A `MaskedFieldRow` records audit history of which values were masked
 * when a view/user combination triggered the policy.
 */

export type MaskingStrategy =
  | 'full-redact'
  | 'partial'
  | 'regex'
  | 'hash'
  | 'keep-last'
  | 'email-local'
  | 'phone-tail';

export type MaskingScope = 'all' | 'role-based' | 'field-based';

export type MaskingRole = 'owner' | 'creator' | 'editor' | 'commenter' | 'viewer';

export interface IRegexRule {
  pattern: string;
  replacement: string;
}

export interface IPartialRule {
  keepPrefix: number;
  keepSuffix: number;
  mask: string;
}

export interface IMaskingPolicy {
  id: string;
  baseId: string;
  tableId: string;
  fieldId: string;
  strategy: MaskingStrategy;
  /// Scope: how broad this policy applies. 'role-based' restricts to a role list.
  scope: MaskingScope;
  /// Roles allowed to see the un-masked value when scope='role-based'.
  allowedRoles: MaskingRole[];
  /// Partial rules used when strategy='partial'.
  partial?: IPartialRule;
  /// Regex rules used when strategy='regex'. Multiple applied in order.
  regexRules?: IRegexRule[];
  /// Custom label displayed in the UI.
  label?: string;
  createdTime: Date;
  updatedTime: Date;
}

export interface IMaskedFieldRow {
  id: string;
  baseId: string;
  tableId: string;
  recordId: string;
  fieldId: string;
  policyId: string;
  /// The user whose view triggered the masking.
  viewerUserId: string;
  createdTime: Date;
}

export interface ICreatePolicyInput {
  baseId: string;
  tableId: string;
  fieldId: string;
  strategy: MaskingStrategy;
  scope: MaskingScope;
  allowedRoles?: MaskingRole[];
  partial?: IPartialRule;
  regexRules?: IRegexRule[];
  label?: string;
}

export const DEFAULT_PARTIAL_KEEP_PREFIX = 2;
export const DEFAULT_PARTIAL_KEEP_SUFFIX = 2;
export const DEFAULT_PARTIAL_MASK = '*';
export const HASH_PREFIX = 'h:';
