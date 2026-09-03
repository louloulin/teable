/**
 * Automation engine MVP types.
 *
 * Mirrors Prisma enums; re-exported so consumers don't reach into the
 * generated client directly. Any change here must be reflected in
 * `packages/db-main-prisma/prisma/postgres/schema.prisma` and the
 * corresponding migration.
 */

export type AutomationTriggerType =
  | 'record_created'
  | 'record_updated'
  | 'record_deleted'
  | 'record_matches_conditions'
  | 'schedule'
  | 'button_clicked'
  | 'form_submitted'
  | 'webhook_received'
  | 'email_received';

export type AutomationActionType =
  | 'create_record'
  | 'get_records'
  | 'http_request'
  | 'update_record'
  | 'conditional_logic'
  | 'ai_generate'
  | 'webhook'
  | 'email'
  | 'slack'
  | 'discord'
  | 'telegram'
  | 'teams'
  | 'run_script'
  | 'send_email'
  | 'call_webhook'
  | 'notify_user'
  | 'ai_prompt'
  | 'send_teams_message'
  | 'send_feishu_message';

export type AutomationRunStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

export type AutomationAdminRunStatus = AutomationRunStatus | 'canceled';

export const AUTOMATION_RUN_STATUSES: readonly AutomationRunStatus[] = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
] as const;

export const AUTOMATION_TRIGGER_TYPES: readonly AutomationTriggerType[] = [
  'record_created',
  'record_updated',
  'record_deleted',
  'record_matches_conditions',
  'schedule',
  'button_clicked',
  'form_submitted',
  'webhook_received',
  'email_received',
] as const;

export const AUTOMATION_ACTION_TYPES: readonly AutomationActionType[] = [
  'update_record',
  'create_record',
  'get_records',
  'http_request',
  'webhook',
  'conditional_logic',
  'ai_generate',
  'email',
  'slack',
  'discord',
  'telegram',
  'teams',
  'run_script',
  'send_email',
  'call_webhook',
  'notify_user',
  'ai_prompt',
  'send_teams_message',
  'send_feishu_message',
] as const;

/**
 * Row shape returned by `AutomationService.list()` and friends.
 * Kept narrow on purpose — UI maps richer DTOs onto these.
 */
export interface IAutomationRow {
  id: string;
  baseId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdBy: string;
  createdTime: Date;
  lastModifiedBy: string | null;
  lastModifiedTime: Date | null;
  draftConfig?: Record<string, unknown> | null;
  draftVersion?: number;
  liveVersion?: number;
}

export interface IAutomationTriggerRow {
  id: string;
  automationId: string;
  type: AutomationTriggerType;
  tableId: string | null;
  config: Record<string, unknown>;
  createdTime: Date;
}

export interface IAutomationActionRow {
  id: string;
  automationId: string;
  type: AutomationActionType;
  orderIndex: number;
  config: Record<string, unknown>;
  createdTime: Date;
}

export interface IAutomationRunRow {
  id: string;
  automationId: string;
  triggerType: AutomationTriggerType;
  status: AutomationRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  retryCount: number;
  parentRunId?: string | null;
  version?: number;
  resumeFromStep?: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdTime: Date;
}

export interface IAutomationRunStep {
  index: number;
  actionType: AutomationActionType;
  status: 'succeeded' | 'failed';
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt: string;
}

export interface IAutomationDetail extends IAutomationRow {
  triggers: IAutomationTriggerRow[];
  actions: IAutomationActionRow[];
}

/**
 * Input shape for `AutomationService.create()`.
 *
 * `baseId`/`name`/`createdBy` are required; trigger/action lists must be
 * non-empty when the automation is meant to do anything.
 */
export interface IAutomationCreateInput {
  baseId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  createdBy: string;
  triggers: Array<{
    type: AutomationTriggerType;
    tableId?: string;
    config?: Record<string, unknown>;
  }>;
  actions: Array<{
    type: AutomationActionType;
    orderIndex?: number;
    config?: Record<string, unknown>;
  }>;
}

export interface IAutomationUpdateInput {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  lastModifiedBy: string;
  triggers: IAutomationCreateInput['triggers'];
  actions: IAutomationCreateInput['actions'];
}

export interface IAutomationDraft {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  triggers: IAutomationCreateInput['triggers'];
  actions: IAutomationCreateInput['actions'];
}

export interface IAutomationAiDraftInput {
  baseId: string;
  prompt: string;
  automationId?: string;
  modelKey?: string;
  offline?: boolean;
}

export interface IAutomationAiDraftResult {
  source: 'ai' | 'offline';
  model: string;
  draft: IAutomationDraft;
}

/**
 * Input shape for `AutomationService.trigger()`. Mirrors what record-event
 * hooks will eventually pass; kept structural so callers (and tests) can
 * construct one without touching Prisma.
 */
export interface IAutomationTriggerInput {
  triggerType: AutomationTriggerType;
  payload: Record<string, unknown>;
}

export interface IAutomationCondition {
  fieldId: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'greater_than'
    | 'less_than'
    | 'is_empty'
    | 'is_not_empty';
  value?: unknown;
}
