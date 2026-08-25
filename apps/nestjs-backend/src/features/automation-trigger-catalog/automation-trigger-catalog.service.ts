/**
 * Automation Trigger Catalog — pure helpers (Stage 108).
 */

import {
  ITriggerCatalog,
  ITriggerFieldSpec,
  ITriggerTypeSpec,
  ITriggerValidationIssue,
  ITriggerValidationResult,
  MAX_TRIGGER_CATALOG_TYPES,
  MAX_TRIGGER_FIELDS_PER_TYPE,
} from './automation-trigger-catalog.types';

/** Built-in trigger catalog. UI may extend via DB. */
export const BUILTIN_TRIGGER_CATALOG: ITriggerCatalog = {
  version: 1,
  types: [
    {
      type: 'record_created',
      label: 'Record created',
      category: 'record',
      description: 'Fires when a new record is added to a table.',
      icon: 'plus-circle',
      fields: [
        { key: 'tableId', label: 'Table', kind: 'string', required: true },
        { key: 'filter', label: 'Filter', kind: 'json', required: false, defaultValue: {} },
      ],
      outputKeys: ['recordId', 'tableId', 'createdTime', 'values'],
    },
    {
      type: 'record_updated',
      label: 'Record updated',
      category: 'record',
      description: 'Fires when fields on an existing record change.',
      icon: 'edit',
      fields: [
        { key: 'tableId', label: 'Table', kind: 'string', required: true },
        { key: 'watchFields', label: 'Watch fields', kind: 'json', required: false, defaultValue: [] },
      ],
      outputKeys: ['recordId', 'tableId', 'before', 'after'],
    },
    {
      type: 'record_deleted',
      label: 'Record deleted',
      category: 'record',
      description: 'Fires when a record is removed.',
      icon: 'trash-2',
      fields: [
        { key: 'tableId', label: 'Table', kind: 'string', required: true },
      ],
      outputKeys: ['recordId', 'tableId'],
    },
    {
      type: 'schedule',
      label: 'Schedule',
      category: 'schedule',
      description: 'Fires on a cron schedule.',
      icon: 'clock',
      fields: [
        { key: 'cron', label: 'Cron expression', kind: 'cron', required: true },
        { key: 'timezone', label: 'Timezone', kind: 'string', required: false, defaultValue: 'UTC' },
      ],
      outputKeys: ['fireTime'],
    },
    {
      type: 'webhook_inbound',
      label: 'Inbound webhook',
      category: 'webhook',
      description: 'Fires when an inbound webhook is received.',
      icon: 'globe',
      fields: [
        { key: 'path', label: 'Path', kind: 'string', required: true },
        { key: 'secret', label: 'HMAC secret', kind: 'string', required: false },
      ],
      outputKeys: ['headers', 'body', 'receivedAt'],
    },
    {
      type: 'manual',
      label: 'Manual trigger',
      category: 'manual',
      description: 'Run on demand from the editor.',
      icon: 'play',
      fields: [
        { key: 'inputs', label: 'Inputs', kind: 'json', required: false, defaultValue: {} },
      ],
      outputKeys: ['inputs'],
    },
  ],
  defaultType: 'record_created',
};

/** Build a deterministic lookup table from type → spec. */
export function indexTriggerCatalog(catalog: ITriggerCatalog): Map<string, ITriggerTypeSpec> {
  const out = new Map<string, ITriggerTypeSpec>();
  for (const t of catalog.types) out.set(t.type, t);
  return out;
}

/** Return the spec for a given trigger type, or undefined. */
export function getTriggerSpec(
  catalog: ITriggerCatalog,
  type: string
): ITriggerTypeSpec | undefined {
  return indexTriggerCatalog(catalog).get(type);
}

/** List trigger types filtered by category. */
export function listTriggersByCategory(
  catalog: ITriggerCatalog,
  category: string
): ITriggerTypeSpec[] {
  return catalog.types.filter((t) => t.category === category);
}

/** Group trigger types by category for palette rendering. */
export function groupTriggersByCategory(
  catalog: ITriggerCatalog
): Record<string, ITriggerTypeSpec[]> {
  const out: Record<string, ITriggerTypeSpec[]> = {};
  for (const t of catalog.types) {
    (out[t.category] ??= []).push(t);
  }
  return out;
}

/** Validate a config payload against the type's field spec. */
export function validateTriggerConfig(
  catalog: ITriggerCatalog,
  type: string,
  config: Record<string, unknown>
): ITriggerValidationResult {
  const issues: ITriggerValidationIssue[] = [];
  const spec = getTriggerSpec(catalog, type);
  const normalized: Record<string, unknown> = {};
  if (!spec) {
    issues.push({ type, field: '*', message: `unknown trigger type: ${type}` });
    return { ok: false, issues, normalized };
  }
  for (const field of spec.fields) {
    const value = config?.[field.key];
    if (value === undefined || value === null || value === '') {
      if (field.required) {
        issues.push({ type, field: field.key, message: `required field missing: ${field.key}` });
      } else if (field.defaultValue !== undefined) {
        normalized[field.key] = field.defaultValue;
      }
      continue;
    }
    const err = validateField(field, value);
    if (err) issues.push({ type, field: field.key, message: err });
    normalized[field.key] = value;
  }
  return { ok: issues.length === 0, issues, normalized };
}

function validateField(field: ITriggerFieldSpec, value: unknown): string | null {
  switch (field.kind) {
    case 'string':
      return typeof value === 'string' ? null : `expected string for ${field.key}`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `expected number for ${field.key}`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `expected boolean for ${field.key}`;
    case 'select':
      return field.options && field.options.includes(String(value))
        ? null
        : `value ${String(value)} not in options`;
    case 'cron':
      return typeof value === 'string' && /^[0-9*\/,\-\s]+$/.test(value)
        ? null
        : `invalid cron: ${String(value)}`;
    case 'json':
      return typeof value === 'object' ? null : `expected object for ${field.key}`;
    default:
      return null;
  }
}

/** Merge two catalogs (extension wins on conflict). */
export function mergeTriggerCatalogs(
  base: ITriggerCatalog,
  ext: ITriggerCatalog
): ITriggerCatalog {
  const byType = new Map<string, ITriggerTypeSpec>();
  for (const t of base.types) byType.set(t.type, t);
  for (const t of ext.types) byType.set(t.type, t);
  const merged: ITriggerTypeSpec[] = Array.from(byType.values()).slice(0, MAX_TRIGGER_CATALOG_TYPES);
  return {
    version: Math.max(base.version, ext.version),
    types: merged,
    defaultType: ext.defaultType ?? base.defaultType,
  };
}

/** Cap types and field counts for safety. */
export function capTriggerCatalog(catalog: ITriggerCatalog): ITriggerCatalog {
  return {
    version: catalog.version,
    defaultType: catalog.defaultType,
    types: catalog.types.slice(0, MAX_TRIGGER_CATALOG_TYPES).map((t) => ({
      ...t,
      fields: t.fields.slice(0, MAX_TRIGGER_FIELDS_PER_TYPE),
    })),
  };
}

/** Find required fields missing from config. */
export function missingTriggerFields(
  catalog: ITriggerCatalog,
  type: string,
  config: Record<string, unknown>
): string[] {
  const spec = getTriggerSpec(catalog, type);
  if (!spec) return [];
  return spec.fields.filter((f) => f.required && !config[f.key]).map((f) => f.key);
}

/** Whether a given output key is exposed by the trigger. */
export function hasTriggerOutputKey(
  catalog: ITriggerCatalog,
  type: string,
  key: string
): boolean {
  const spec = getTriggerSpec(catalog, type);
  return !!spec && spec.outputKeys.includes(key);
}

/** Stable JSON of the catalog for hashing. */
export function serializeTriggerCatalog(catalog: ITriggerCatalog): string {
  return JSON.stringify(catalog);
}

/** Pretty-print a summary of the catalog (for editor palette sidebar). */
export function summarizeTriggerCatalog(
  catalog: ITriggerCatalog
): { count: number; categories: Record<string, number> } {
  const categories: Record<string, number> = {};
  for (const t of catalog.types) {
    categories[t.category] = (categories[t.category] ?? 0) + 1;
  }
  return { count: catalog.types.length, categories };
}