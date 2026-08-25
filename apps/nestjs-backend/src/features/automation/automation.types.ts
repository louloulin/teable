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
  | 'schedule';

export type AutomationActionType =
  | 'update_record'
  | 'webhook'
  | 'email'
  | 'slack'
  | 'discord'
  | 'telegram';

export type AutomationRunStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped';

export const AUTOMATION_TRIGGER_TYPES: readonly AutomationTriggerType[] = [
  'record_created',
  'record_updated',
  'record_deleted',
  'schedule',
] as const;

export const AUTOMATION_ACTION_TYPES: readonly AutomationActionType[] = [
  'update_record',
  'webhook',
  'email',
  'slack',
  'discord',
  'telegram',
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
  startedAt: Date | null;
  finishedAt: Date | null;
  createdTime: Date;
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

/**
 * Input shape for `AutomationService.trigger()`. Mirrors what record-event
 * hooks will eventually pass; kept structural so callers (and tests) can
 * construct one without touching Prisma.
 */
export interface IAutomationTriggerInput {
  triggerType: AutomationTriggerType;
  payload: Record<string, unknown>;
}
