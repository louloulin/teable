/**
 * Automation Trigger Catalog — types (Stage 108).
 *
 * Registry describing all available trigger types and how to validate
 * their per-trigger config payloads.
 */

export type AutomationTriggerCategory =
  | 'record'
  | 'schedule'
  | 'webhook'
  | 'manual'
  | 'system';

export interface ITriggerFieldSpec {
  /** Field key (camelCase). */
  key: string;
  /** Field label shown in UI. */
  label: string;
  /** "string" | "number" | "boolean" | "select" | "json" | "cron". */
  kind: 'string' | 'number' | 'boolean' | 'select' | 'json' | 'cron';
  /** Whether the field must be present. */
  required: boolean;
  /** Default value (when not required). */
  defaultValue?: unknown;
  /** Allowed values for 'select'. */
  options?: readonly string[];
  /** Field help text. */
  help?: string;
}

export interface ITriggerTypeSpec {
  /** Type id, e.g. 'record_created'. */
  type: string;
  /** Display name. */
  label: string;
  /** Category for grouping in UI. */
  category: AutomationTriggerCategory;
  /** Short description. */
  description: string;
  /** Icon name (resolved by UI). */
  icon: string;
  /** Config schema. */
  fields: ITriggerFieldSpec[];
  /** Output schema (key list exposed to downstream nodes). */
  outputKeys: readonly string[];
}

export interface ITriggerCatalog {
  /** Catalog version (bumped on breaking changes). */
  version: number;
  /** All registered trigger types. */
  types: ITriggerTypeSpec[];
  /** Default trigger for "new automation" UX. */
  defaultType: string;
}

export interface ITriggerValidationIssue {
  type: string;
  field: string;
  message: string;
}

export interface ITriggerValidationResult {
  ok: boolean;
  issues: ITriggerValidationIssue[];
  /** Normalized config (defaults applied). */
  normalized: Record<string, unknown>;
}

export const MAX_TRIGGER_CATALOG_TYPES = 64;
export const MAX_TRIGGER_FIELDS_PER_TYPE = 24;