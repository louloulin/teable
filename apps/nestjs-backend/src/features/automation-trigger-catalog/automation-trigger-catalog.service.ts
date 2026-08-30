/**
 * Automation Trigger Catalog — pure helpers (Stage 108).
 */

import {
  MAX_TRIGGER_CATALOG_TYPES,
  MAX_TRIGGER_FIELDS_PER_TYPE,
} from './automation-trigger-catalog.types';
import type {
  ITriggerCatalog,
  ITriggerFieldSpec,
  ITriggerTypeSpec,
  ITriggerValidationIssue,
  ITriggerValidationResult,
} from './automation-trigger-catalog.types';

/** Built-in trigger catalog. UI may extend via DB. */
export const BUILTIN_TRIGGER_CATALOG: ITriggerCatalog = {
  version: 1,
  types: [
    {
      type: 'record_matches_conditions',
      label: 'Record matches conditions',
      category: 'record',
      description: 'Fires when an updated record matches configured conditions.',
      icon: 'filter',
      fields: [
        { key: 'tableId', label: 'Table', kind: 'string', required: true },
        { key: 'conditions', label: 'Conditions', kind: 'json', required: true },
      ],
      outputKeys: ['recordId', 'tableId', 'before', 'after', 'values'],
    },
    {
      type: 'button_clicked',
      label: 'Button clicked',
      category: 'manual',
      description: 'Fires when a configured button invokes the automation.',
      icon: 'mouse-pointer-click',
      fields: [{ key: 'tableId', label: 'Table', kind: 'string', required: false }],
      outputKeys: ['tableId', 'recordId', 'inputs'],
    },
    {
      type: 'form_submitted',
      label: 'Form submitted',
      category: 'system',
      description: 'Fires when a form submits a record payload.',
      icon: 'file-input',
      fields: [{ key: 'tableId', label: 'Table', kind: 'string', required: true }],
      outputKeys: ['tableId', 'recordId', 'values'],
    },
    {
      type: 'webhook_received',
      label: 'Inbound webhook',
      category: 'webhook',
      description: 'Fires when an inbound webhook is received.',
      icon: 'globe',
      fields: [{ key: 'secret', label: 'HMAC secret', kind: 'string', required: false }],
      outputKeys: ['headers', 'body', 'receivedAt'],
    },
    {
      type: 'email_received',
      label: 'Email received',
      category: 'system',
      description: 'Fires when an inbound email payload is received.',
      icon: 'mail',
      fields: [{ key: 'secret', label: 'HMAC secret', kind: 'string', required: false }],
      outputKeys: ['headers', 'body', 'receivedAt'],
    },
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
        {
          key: 'watchFields',
          label: 'Watch fields',
          kind: 'json',
          required: false,
          defaultValue: [],
        },
      ],
      outputKeys: ['recordId', 'tableId', 'before', 'after'],
    },
    {
      type: 'record_deleted',
      label: 'Record deleted',
      category: 'record',
      description: 'Fires when a record is removed.',
      icon: 'trash-2',
      fields: [{ key: 'tableId', label: 'Table', kind: 'string', required: true }],
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
        {
          key: 'timezone',
          label: 'Timezone',
          kind: 'string',
          required: false,
          defaultValue: 'UTC',
        },
      ],
      outputKeys: ['fireTime'],
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
  const validators: Record<
    ITriggerFieldSpec['kind'],
    (field: ITriggerFieldSpec, value: unknown) => string | null
  > = {
    string: (current, currentValue) =>
      typeof currentValue === 'string' ? null : `expected string for ${current.key}`,
    number: (current, currentValue) =>
      typeof currentValue === 'number' && Number.isFinite(currentValue)
        ? null
        : `expected number for ${current.key}`,
    boolean: (current, currentValue) =>
      typeof currentValue === 'boolean' ? null : `expected boolean for ${current.key}`,
    select: (current, currentValue) =>
      current.options?.includes(String(currentValue))
        ? null
        : `value ${String(currentValue)} not in options`,
    cron: (_current, currentValue) =>
      typeof currentValue === 'string' && /^[0-9*,\-\s]+$/.test(currentValue)
        ? null
        : `invalid cron: ${String(currentValue)}`,
    json: (current, currentValue) =>
      typeof currentValue === 'object' ? null : `expected object for ${current.key}`,
  };
  return validators[field.kind](field, value);
}

/** Merge two catalogs (extension wins on conflict). */
export function mergeTriggerCatalogs(base: ITriggerCatalog, ext: ITriggerCatalog): ITriggerCatalog {
  const byType = new Map<string, ITriggerTypeSpec>();
  for (const t of base.types) byType.set(t.type, t);
  for (const t of ext.types) byType.set(t.type, t);
  const merged: ITriggerTypeSpec[] = Array.from(byType.values()).slice(
    0,
    MAX_TRIGGER_CATALOG_TYPES
  );
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
export function hasTriggerOutputKey(catalog: ITriggerCatalog, type: string, key: string): boolean {
  const spec = getTriggerSpec(catalog, type);
  return !!spec && spec.outputKeys.includes(key);
}

/** Stable JSON of the catalog for hashing. */
export function serializeTriggerCatalog(catalog: ITriggerCatalog): string {
  return JSON.stringify(catalog);
}

/** Pretty-print a summary of the catalog (for editor palette sidebar). */
export function summarizeTriggerCatalog(catalog: ITriggerCatalog): {
  count: number;
  categories: Record<string, number>;
} {
  const categories: Record<string, number> = {};
  for (const t of catalog.types) {
    categories[t.category] = (categories[t.category] ?? 0) + 1;
  }
  return { count: catalog.types.length, categories };
}
