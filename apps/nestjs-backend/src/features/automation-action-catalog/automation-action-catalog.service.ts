/**
 * Automation Action Catalog — pure helpers (Stage 109).
 */

import {
  DEFAULT_ACTION_RETRY,
  IActionCatalog,
  IActionFieldSpec,
  IActionRetrySpec,
  IActionTypeSpec,
  IActionValidationIssue,
  IActionValidationResult,
  MAX_ACTION_CATALOG_TYPES,
  MAX_ACTION_FIELDS_PER_TYPE,
} from './automation-action-catalog.types';

/** Built-in action catalog. */
export const BUILTIN_ACTION_CATALOG: IActionCatalog = {
  version: 1,
  types: [
    {
      type: 'update_record',
      label: 'Update record',
      category: 'record',
      description: 'Update fields of a target record.',
      icon: 'edit',
      fields: [
        { key: 'tableId', label: 'Table', kind: 'string', required: true },
        { key: 'recordId', label: 'Record id', kind: 'string', required: true },
        { key: 'patch', label: 'Patch', kind: 'json', required: true },
      ],
      retry: { maxAttempts: 3, backoff: 'exponential', initialDelayMs: 500 },
      rollback: true,
    },
    {
      type: 'send_email',
      label: 'Send email',
      category: 'notification',
      description: 'Send an email through the configured SMTP relay.',
      icon: 'mail',
      fields: [
        { key: 'to', label: 'To', kind: 'string', required: true },
        { key: 'subject', label: 'Subject', kind: 'template', required: true },
        { key: 'body', label: 'Body', kind: 'template', required: true },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 1000 },
      rollback: false,
    },
    {
      type: 'call_webhook',
      label: 'Call webhook',
      category: 'integration',
      description: 'POST a payload to an external URL.',
      icon: 'globe',
      fields: [
        { key: 'url', label: 'URL', kind: 'string', required: true },
        { key: 'payload', label: 'Payload', kind: 'json', required: false, defaultValue: {} },
        { key: 'headers', label: 'Headers', kind: 'json', required: false, defaultValue: {} },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 2000 },
      rollback: false,
    },
    {
      type: 'notify_user',
      label: 'Notify user',
      category: 'notification',
      description: 'Send an in-app notification to a user.',
      icon: 'bell',
      fields: [
        { key: 'userId', label: 'User id', kind: 'string', required: true },
        { key: 'message', label: 'Message', kind: 'template', required: true },
        { key: 'channel', label: 'Channel', kind: 'select', required: false, defaultValue: 'in-app', options: ['in-app', 'email', 'slack'] },
      ],
      retry: { maxAttempts: 3, backoff: 'linear', initialDelayMs: 500 },
      rollback: false,
    },
    {
      type: 'ai_prompt',
      label: 'AI prompt',
      category: 'ai',
      description: 'Call an AI model with a templated prompt.',
      icon: 'cpu',
      fields: [
        { key: 'model', label: 'Model', kind: 'select', required: true, options: ['gpt-4o-mini', 'claude-sonnet-4', 'gemini-pro'] },
        { key: 'prompt', label: 'Prompt', kind: 'template', required: true },
        { key: 'temperature', label: 'Temperature', kind: 'number', required: false, defaultValue: 0.2 },
      ],
      retry: { maxAttempts: 3, backoff: 'exponential', initialDelayMs: 1500 },
      rollback: false,
    },
    {
      type: 'send_teams_message',
      label: 'Send Microsoft Teams message',
      category: 'integration',
      description:
        'Post a MessageCard to a Microsoft Teams channel via Incoming Webhook. ' +
        'If `webhookUrl` is omitted, the per-space default configured by the ' +
        'admin is used.',
      icon: 'send',
      fields: [
        { key: 'webhookUrl', label: 'Webhook URL', kind: 'string', required: false },
        { key: 'spaceId', label: 'Space id', kind: 'string', required: false },
        { key: 'text', label: 'Text', kind: 'template', required: true },
        { key: 'title', label: 'Title', kind: 'string', required: false },
        {
          key: 'fields',
          label: 'Fields',
          kind: 'json',
          required: false,
          defaultValue: [],
        },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 1000 },
      rollback: false,
    },
  ],
  defaultType: 'update_record',
};

function validateField(field: IActionFieldSpec, value: unknown): string | null {
  switch (field.kind) {
    case 'string':
    case 'template':
      return typeof value === 'string' ? null : `expected string for ${field.key}`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `expected number for ${field.key}`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `expected boolean for ${field.key}`;
    case 'select':
      return field.options && field.options.includes(String(value))
        ? null
        : `value ${String(value)} not in options`;
    case 'json':
      return typeof value === 'object' && value !== null ? null : `expected object for ${field.key}`;
    default:
      return null;
  }
}

/** Index the catalog by type. */
export function indexActionCatalog(catalog: IActionCatalog): Map<string, IActionTypeSpec> {
  const out = new Map<string, IActionTypeSpec>();
  for (const t of catalog.types) out.set(t.type, t);
  return out;
}

/** Lookup single spec. */
export function getActionSpec(catalog: IActionCatalog, type: string): IActionTypeSpec | undefined {
  return indexActionCatalog(catalog).get(type);
}

/** Group by category. */
export function groupActionsByCategory(catalog: IActionCatalog): Record<string, IActionTypeSpec[]> {
  const out: Record<string, IActionTypeSpec[]> = {};
  for (const t of catalog.types) (out[t.category] ??= []).push(t);
  return out;
}

/** List by category. */
export function listActionsByCategory(catalog: IActionCatalog, category: string): IActionTypeSpec[] {
  return catalog.types.filter((t) => t.category === category);
}

/** Validate a config payload. */
export function validateActionConfig(
  catalog: IActionCatalog,
  type: string,
  config: Record<string, unknown>
): IActionValidationResult {
  const issues: IActionValidationIssue[] = [];
  const normalized: Record<string, unknown> = {};
  const spec = getActionSpec(catalog, type);
  if (!spec) {
    issues.push({ type, field: '*', message: `unknown action type: ${type}` });
    return { ok: false, issues, normalized, retry: DEFAULT_ACTION_RETRY };
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
  return { ok: issues.length === 0, issues, normalized, retry: spec.retry ?? DEFAULT_ACTION_RETRY };
}

/** Compute total retry delay across all attempts (linear/exponential). */
export function computeRetryDelay(retry: IActionRetrySpec): number {
  if (retry.backoff === 'none') return 0;
  let total = 0;
  for (let i = 0; i < retry.maxAttempts; i++) {
    const d = retry.backoff === 'exponential'
      ? retry.initialDelayMs * Math.pow(2, i)
      : retry.initialDelayMs * (i + 1);
    total += d;
  }
  return total;
}

/** Whether the action supports rollback. */
export function isRollbackable(catalog: IActionCatalog, type: string): boolean {
  return getActionSpec(catalog, type)?.rollback ?? false;
}

/** Merge two catalogs. */
export function mergeActionCatalogs(base: IActionCatalog, ext: IActionCatalog): IActionCatalog {
  const byType = new Map<string, IActionTypeSpec>();
  for (const t of base.types) byType.set(t.type, t);
  for (const t of ext.types) byType.set(t.type, t);
  return {
    version: Math.max(base.version, ext.version),
    defaultType: ext.defaultType ?? base.defaultType,
    types: Array.from(byType.values()).slice(0, MAX_ACTION_CATALOG_TYPES),
  };
}

/** Cap fields/types. */
export function capActionCatalog(catalog: IActionCatalog): IActionCatalog {
  return {
    version: catalog.version,
    defaultType: catalog.defaultType,
    types: catalog.types.slice(0, MAX_ACTION_CATALOG_TYPES).map((t) => ({
      ...t,
      fields: t.fields.slice(0, MAX_ACTION_FIELDS_PER_TYPE),
    })),
  };
}

/** Stable JSON for hashing. */
export function serializeActionCatalog(catalog: IActionCatalog): string {
  return JSON.stringify(catalog);
}

/** Summary. */
export function summarizeActionCatalog(catalog: IActionCatalog): { count: number; rollbackable: number; categories: Record<string, number> } {
  const categories: Record<string, number> = {};
  let rollbackable = 0;
  for (const t of catalog.types) {
    categories[t.category] = (categories[t.category] ?? 0) + 1;
    if (t.rollback) rollbackable++;
  }
  return { count: catalog.types.length, rollbackable, categories };
}