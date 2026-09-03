/**
 * Automation Action Catalog — pure helpers (Stage 109).
 */

import {
  DEFAULT_ACTION_RETRY,
  MAX_ACTION_CATALOG_TYPES,
  MAX_ACTION_FIELDS_PER_TYPE,
} from './automation-action-catalog.types';
import type {
  IActionCatalog,
  IActionFieldSpec,
  IActionRetrySpec,
  IActionTypeSpec,
  IActionValidationIssue,
  IActionValidationResult,
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
        { key: 'fields', label: 'Fields', kind: 'json', required: true },
      ],
      retry: { maxAttempts: 3, backoff: 'exponential', initialDelayMs: 500 },
      rollback: true,
    },
    {
      type: 'create_record',
      label: 'Create record',
      category: 'record',
      description: 'Create a record in a target table.',
      icon: 'plus-circle',
      fields: [
        { key: 'tableId', label: 'Table', kind: 'string', required: true },
        { key: 'fields', label: 'Fields', kind: 'json', required: true },
        {
          key: 'fieldKeyType',
          label: 'Field key type',
          kind: 'select',
          required: false,
          defaultValue: 'id',
          options: ['id', 'name'],
        },
        {
          key: 'typecast',
          label: 'Typecast',
          kind: 'boolean',
          required: false,
          defaultValue: false,
        },
      ],
      retry: { maxAttempts: 3, backoff: 'exponential', initialDelayMs: 500 },
      rollback: false,
    },
    {
      type: 'get_records',
      label: 'Get records',
      category: 'record',
      description: 'Read records from a target table.',
      icon: 'list',
      fields: [
        { key: 'tableId', label: 'Table', kind: 'string', required: true },
        { key: 'query', label: 'Query', kind: 'json', required: false, defaultValue: {} },
      ],
      retry: { maxAttempts: 3, backoff: 'exponential', initialDelayMs: 500 },
      rollback: false,
    },
    {
      type: 'http_request',
      label: 'HTTP request',
      category: 'integration',
      description: 'Send an HTTP request to an external URL.',
      icon: 'globe',
      fields: [
        { key: 'url', label: 'URL', kind: 'string', required: true },
        {
          key: 'method',
          label: 'Method',
          kind: 'select',
          required: false,
          defaultValue: 'POST',
          options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        },
        { key: 'headers', label: 'Headers', kind: 'json', required: false, defaultValue: {} },
        { key: 'body', label: 'Body', kind: 'json', required: false },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 2000 },
      rollback: false,
    },
    {
      type: 'webhook',
      label: 'Webhook',
      category: 'integration',
      description: 'Dispatch a signed outbound webhook.',
      icon: 'send',
      fields: [
        { key: 'url', label: 'URL', kind: 'string', required: true },
        { key: 'payload', label: 'Payload', kind: 'json', required: false, defaultValue: {} },
        { key: 'headers', label: 'Headers', kind: 'json', required: false, defaultValue: {} },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 2000 },
      rollback: false,
    },
    {
      type: 'conditional_logic',
      label: 'Conditional logic',
      category: 'system',
      description: 'Evaluate conditions and execute one branch.',
      icon: 'git-branch',
      fields: [
        { key: 'conditions', label: 'Conditions', kind: 'json', required: true },
        { key: 'ifTrue', label: 'If true', kind: 'json', required: false, defaultValue: [] },
        { key: 'ifFalse', label: 'If false', kind: 'json', required: false, defaultValue: [] },
      ],
      retry: { maxAttempts: 1, backoff: 'none', initialDelayMs: 0 },
      rollback: false,
    },
    {
      type: 'ai_generate',
      label: 'AI generate',
      category: 'ai',
      description: 'Generate text or JSON with an AI model.',
      icon: 'cpu',
      fields: [
        { key: 'prompt', label: 'Prompt', kind: 'template', required: true },
        { key: 'modelKey', label: 'Model', kind: 'string', required: false },
        {
          key: 'outputType',
          label: 'Output type',
          kind: 'select',
          required: false,
          defaultValue: 'text',
          options: ['text', 'json'],
        },
      ],
      retry: { maxAttempts: 3, backoff: 'exponential', initialDelayMs: 1500 },
      rollback: false,
    },
    {
      type: 'email',
      label: 'Email',
      category: 'notification',
      description: 'Send an email through the configured SMTP relay.',
      icon: 'mail',
      fields: [
        { key: 'to', label: 'To', kind: 'string', required: true },
        { key: 'subject', label: 'Subject', kind: 'template', required: true },
        { key: 'body', label: 'Body', kind: 'template', required: true },
        { key: 'html', label: 'HTML', kind: 'template', required: false },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 1000 },
      rollback: false,
    },
    {
      type: 'slack',
      label: 'Slack message',
      category: 'integration',
      description: 'Send a message through the Slack bridge.',
      icon: 'message-square',
      fields: [
        { key: 'webhookUrl', label: 'Webhook URL', kind: 'string', required: true },
        { key: 'text', label: 'Message', kind: 'template', required: false },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 1000 },
      rollback: false,
    },
    {
      type: 'discord',
      label: 'Discord message',
      category: 'integration',
      description: 'Send a message through the Discord bridge.',
      icon: 'message-square',
      fields: [
        { key: 'webhookUrl', label: 'Webhook URL', kind: 'string', required: true },
        { key: 'text', label: 'Message', kind: 'template', required: true },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 1000 },
      rollback: false,
    },
    {
      type: 'telegram',
      label: 'Telegram message',
      category: 'integration',
      description: 'Send a message through the Telegram bridge.',
      icon: 'message-square',
      fields: [
        { key: 'webhookUrl', label: 'Webhook URL', kind: 'string', required: true },
        { key: 'text', label: 'Message', kind: 'template', required: true },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 1000 },
      rollback: false,
    },
    {
      type: 'teams',
      label: 'Teams message',
      category: 'integration',
      description: 'Send a message through the Teams bridge.',
      icon: 'message-square',
      fields: [
        { key: 'webhookUrl', label: 'Webhook URL', kind: 'string', required: true },
        { key: 'text', label: 'Message', kind: 'template', required: true },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 1000 },
      rollback: false,
    },
    {
      type: 'run_script',
      label: 'Run script',
      category: 'system',
      description: 'Run a sandboxed JavaScript transformation.',
      icon: 'code',
      fields: [
        { key: 'script', label: 'Script', kind: 'string', required: true },
        { key: 'env', label: 'Environment', kind: 'json', required: false, defaultValue: {} },
        { key: 'timeoutMs', label: 'Timeout', kind: 'number', required: false, defaultValue: 1000 },
      ],
      retry: { maxAttempts: 1, backoff: 'none', initialDelayMs: 0 },
      rollback: false,
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
        { key: 'body', label: 'Body', kind: 'template', required: false },
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
        {
          key: 'channel',
          label: 'Channel',
          kind: 'select',
          required: false,
          defaultValue: 'in-app',
          options: ['in-app', 'email', 'slack'],
        },
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
        { key: 'model', label: 'Model', kind: 'string', required: false },
        { key: 'prompt', label: 'Prompt', kind: 'template', required: true },
        {
          key: 'temperature',
          label: 'Temperature',
          kind: 'number',
          required: false,
          defaultValue: 0.2,
        },
      ],
      retry: { maxAttempts: 3, backoff: 'exponential', initialDelayMs: 1500 },
      rollback: false,
    },
    {
      type: 'send_teams_message',
      label: 'Send Teams message',
      category: 'integration',
      description: 'Send a message to a Microsoft Teams incoming webhook.',
      icon: 'message-square',
      fields: [
        { key: 'webhookUrl', label: 'Webhook URL', kind: 'string', required: true },
        { key: 'text', label: 'Message', kind: 'template', required: true },
        { key: 'title', label: 'Title', kind: 'template', required: false },
        { key: 'fields', label: 'Facts', kind: 'json', required: false, defaultValue: [] },
      ],
      retry: { maxAttempts: 5, backoff: 'exponential', initialDelayMs: 1000 },
      rollback: false,
    },
    {
      type: 'send_feishu_message',
      label: 'Send Feishu message',
      category: 'integration',
      description: 'Send a message through a configured Feishu self-built app.',
      icon: 'message-square',
      fields: [
        { key: 'spaceId', label: 'Space ID', kind: 'string', required: true },
        { key: 'receiveId', label: 'Receive ID override', kind: 'string', required: false },
        {
          key: 'receiveIdType',
          label: 'Receive ID type',
          kind: 'string',
          required: true,
          defaultValue: 'chat_id',
        },
        { key: 'text', label: 'Message', kind: 'template', required: true },
        { key: 'title', label: 'Title', kind: 'template', required: false },
        {
          key: 'kind',
          label: 'Message kind',
          kind: 'select',
          required: false,
          defaultValue: 'text',
          options: ['text', 'image', 'file', 'post'],
        },
        { key: 'imageKey', label: 'Image key', kind: 'string', required: false },
        { key: 'imageUrl', label: 'Image URL', kind: 'string', required: false },
        { key: 'fileKey', label: 'File key', kind: 'string', required: false },
        { key: 'fileUrl', label: 'File URL', kind: 'string', required: false },
        { key: 'fileName', label: 'File name', kind: 'string', required: false },
        { key: 'contentType', label: 'Content type', kind: 'string', required: false },
        { key: 'providerPayload', label: 'Provider payload', kind: 'json', required: false },
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
      return typeof value === 'number' && Number.isFinite(value)
        ? null
        : `expected number for ${field.key}`;
    case 'boolean':
      return typeof value === 'boolean' ? null : `expected boolean for ${field.key}`;
    case 'select':
      return field.options && field.options.includes(String(value))
        ? null
        : `value ${String(value)} not in options`;
    case 'json':
      return typeof value === 'object' && value !== null
        ? null
        : `expected object for ${field.key}`;
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
export function listActionsByCategory(
  catalog: IActionCatalog,
  category: string
): IActionTypeSpec[] {
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
    const d =
      retry.backoff === 'exponential'
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
export function summarizeActionCatalog(catalog: IActionCatalog): {
  count: number;
  rollbackable: number;
  categories: Record<string, number>;
} {
  const categories: Record<string, number> = {};
  let rollbackable = 0;
  for (const t of catalog.types) {
    categories[t.category] = (categories[t.category] ?? 0) + 1;
    if (t.rollback) rollbackable++;
  }
  return { count: catalog.types.length, rollbackable, categories };
}
