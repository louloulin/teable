/**
 * Automation Action Catalog — types (Stage 109).
 */

export type AutomationActionCategory =
  | 'record'
  | 'notification'
  | 'integration'
  | 'ai'
  | 'system';

export interface IActionFieldSpec {
  key: string;
  label: string;
  kind: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'template';
  required: boolean;
  defaultValue?: unknown;
  options?: readonly string[];
  help?: string;
}

export interface IActionRetrySpec {
  /** Maximum retry attempts (0 = no retry). */
  maxAttempts: number;
  /** Backoff strategy. */
  backoff: 'none' | 'linear' | 'exponential';
  /** Initial delay in ms. */
  initialDelayMs: number;
}

export interface IActionTypeSpec {
  type: string;
  label: string;
  category: AutomationActionCategory;
  description: string;
  icon: string;
  fields: IActionFieldSpec[];
  /** Optional retry policy (defaults applied when omitted). */
  retry?: IActionRetrySpec;
  /** Whether the action's effect can be rolled back. */
  rollback: boolean;
}

export interface IActionCatalog {
  version: number;
  types: IActionTypeSpec[];
  defaultType: string;
}

export interface IActionValidationIssue {
  type: string;
  field: string;
  message: string;
}

export interface IActionValidationResult {
  ok: boolean;
  issues: IActionValidationIssue[];
  normalized: Record<string, unknown>;
  retry: IActionRetrySpec;
}

export const MAX_ACTION_CATALOG_TYPES = 64;
export const MAX_ACTION_FIELDS_PER_TYPE = 24;
export const DEFAULT_ACTION_RETRY: IActionRetrySpec = {
  maxAttempts: 3,
  backoff: 'exponential',
  initialDelayMs: 1000,
};