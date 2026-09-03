import { createHash } from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { Queue } from 'bullmq';

import { Encryptor } from '../../utils/encryptor';

import {
  AUTOMATION_SCHEDULE_JOB,
  AUTOMATION_SCHEDULE_QUEUE,
} from './automation-schedule.constants';
import type {
  IAutomationActionRow,
  IAutomationCreateInput,
  IAutomationDetail,
  IAutomationRow,
  IAutomationRunRow,
  IAutomationTriggerInput,
  IAutomationTriggerRow,
  IAutomationCondition,
  IAutomationDraft,
  IAutomationUpdateInput,
} from './automation.types';

/**
 * Prisma delegate shape used by this service. Defined locally so tests
 * can supply a hand-rolled mock that satisfies the contract, and so a
 * future Prisma client that hasn't been regenerated with the automation
 * models still compiles.
 */
interface IAutomationDelegate {
  create(args: { data: Record<string, unknown> }): Promise<IAutomationRow>;
  findFirst(args: {
    where: Record<string, unknown>;
    include?: Record<string, unknown>;
  }): Promise<IAutomationDetail | null>;
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }): Promise<IAutomationRow[]>;
  delete(args: { where: { id: string } }): Promise<unknown>;
  update?(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
}

interface IAutomationTriggerDelegate {
  createMany(args: { data: Array<Record<string, unknown>> }): Promise<{ count: number }>;
  deleteMany?(args: { where: { automationId: string } }): Promise<{ count: number }>;
  findMany(args: { where: Record<string, unknown>; include: Record<string, unknown> }): Promise<
    Array<{
      id: string;
      type: string;
      tableId: string | null;
      automation: IAutomationDetail;
    }>
  >;
}

interface IAutomationActionDelegate {
  createMany(args: { data: Array<Record<string, unknown>> }): Promise<{ count: number }>;
  deleteMany?(args: { where: { automationId: string } }): Promise<{ count: number }>;
}

interface IAutomationRunDelegate {
  create(args: { data: Record<string, unknown> }): Promise<IAutomationRunRow>;
  findFirst(args: { where: Record<string, unknown> }): Promise<IAutomationRunRow | null>;
  findMany?(args: {
    where: Record<string, unknown>;
    orderBy: Record<string, 'asc' | 'desc'>;
    take?: number;
  }): Promise<IAutomationRunRow[]>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<IAutomationRunRow>;
}

interface IAutomationSecretDelegate {
  findMany(args: {
    where: { automationId: string };
  }): Promise<Array<{ name: string; encryptedValue: string }>>;
  upsert(args: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    where: { automationId_name: { automationId: string; name: string } };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }): Promise<unknown>;
  delete(args: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    where: { automationId_name: { automationId: string; name: string } };
  }): Promise<unknown>;
}

interface ITableMetaDelegate {
  findUnique(args: {
    where: { id: string };
    select: { baseId: boolean };
  }): Promise<{ baseId: string } | null>;
}

interface IBaseDelegate {
  findMany(args: {
    where: { spaceId: string; deletedTime?: null };
    select: { id: boolean };
  }): Promise<Array<{ id: string }>>;
}

const cuid = () => `cuid_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * Read & write service for automations and their run history.
 *
 * Exposes the minimum surface needed by the controller:
 *   - list / get / create / delete for automations
 *   - trigger(...) which records an `automation_run` row in `pending`
 *     state. The actual execution (action dispatch) is owned by sibling
 *     services (`Stage 14+`); this method only persists the run intent.
 *
 * Why split: a trigger can fire hundreds of runs/sec during bulk imports,
 * so persistence and dispatch must not block each other. Stage 13 covers
 * persistence + history query; Stage 14 covers dispatch.
 */
@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @InjectQueue(AUTOMATION_SCHEDULE_QUEUE) private readonly scheduleQueue?: Queue
  ) {}

  private get automation(): IAutomationDelegate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as { automation: IAutomationDelegate }).automation;
  }
  private get automationTrigger(): IAutomationTriggerDelegate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as { automationTrigger: IAutomationTriggerDelegate })
      .automationTrigger;
  }
  private get automationAction(): IAutomationActionDelegate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as { automationAction: IAutomationActionDelegate })
      .automationAction;
  }
  private get tableMeta(): ITableMetaDelegate {
    return (this.prisma as unknown as { tableMeta: ITableMetaDelegate }).tableMeta;
  }
  private get automationRun(): IAutomationRunDelegate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as { automationRun: IAutomationRunDelegate }).automationRun;
  }

  private get base(): IBaseDelegate {
    return (this.prisma as unknown as { base: IBaseDelegate }).base;
  }

  private get automationSecret(): IAutomationSecretDelegate {
    return (this.prisma as unknown as { automationSecret: IAutomationSecretDelegate })
      .automationSecret;
  }

  /**
   * Create an automation with its initial triggers and actions.
   *
   * Validation lives in the controller; this method assumes at least one
   * trigger and one action are present. Returns the full detail shape so
   * the controller can echo it back without a follow-up read.
   */
  async create(input: IAutomationCreateInput): Promise<IAutomationDetail> {
    const id = cuid();
    await this.automation.create({
      data: {
        id,
        baseId: input.baseId,
        name: input.name,
        description: input.description ?? null,
        enabled: input.enabled ?? true,
        createdBy: input.createdBy,
        createdTime: new Date(),
        lastModifiedBy: input.createdBy,
        lastModifiedTime: new Date(),
      },
    });
    if (input.triggers.length) {
      await this.automationTrigger.createMany({
        data: input.triggers.map((t) => ({
          id: cuid(),
          automationId: id,
          type: t.type,
          tableId: t.tableId ?? null,
          config: t.config ?? {},
          createdTime: new Date(),
        })),
      });
    }
    if (input.actions.length) {
      await this.automationAction.createMany({
        data: input.actions.map((a, i) => ({
          id: cuid(),
          automationId: id,
          type: a.type,
          orderIndex: a.orderIndex ?? i,
          config: a.config ?? {},
          createdTime: new Date(),
        })),
      });
    }
    await this.syncSchedule(id, input.triggers);
    const detail = await this.automation.findFirst({
      where: { id },
      include: { triggers: true, actions: true },
    });
    if (!detail) {
      // Unreachable in practice — create succeeded so findFirst must too
      // — but tests should never see an undefined detail.
      throw new Error(`automation ${id} disappeared after create`);
    }
    return detail;
  }

  async createDraft(
    baseId: string,
    draft: IAutomationDraft,
    createdBy: string
  ): Promise<IAutomationRow> {
    const id = cuid();
    if (!this.automation.update) throw new Error('automation draft delegate is unavailable');
    return this.automation.create({
      data: {
        id,
        baseId,
        name: draft.name ?? 'AI automation draft',
        description: draft.description ?? null,
        enabled: false,
        createdBy,
        createdTime: new Date(),
        lastModifiedBy: createdBy,
        lastModifiedTime: new Date(),
        draftConfig: draft,
        draftVersion: 1,
        liveVersion: 0,
      },
    });
  }

  /**
   * List all automations for a base, ordered by created time desc.
   * Soft-deleted automations are excluded; we don't yet support soft
   * delete, but the helper is here so the call site can stay stable.
   */
  async listByBase(baseId: string): Promise<IAutomationRow[]> {
    return this.automation.findMany({
      where: { baseId },
      orderBy: { createdTime: 'desc' },
    });
  }

  async get(id: string): Promise<IAutomationDetail | null> {
    return this.automation.findFirst({
      where: { id },
      include: { triggers: true, actions: true },
    });
  }

  async update(id: string, input: IAutomationUpdateInput): Promise<IAutomationDetail> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`automation ${id} not found`);
    const draft: IAutomationDraft = {
      name: input.name,
      description: input.description,
      enabled: input.enabled,
      triggers: input.triggers,
      actions: input.actions,
    };
    const currentDraftVersion = existing.draftVersion ?? 0;
    if (!this.automation.update) {
      throw new Error('automation update delegate is unavailable');
    }
    await this.automation.update({
      where: { id },
      data: { draftConfig: draft, draftVersion: currentDraftVersion + 1 },
    });
    const detail = await this.get(id);
    if (!detail) throw new Error(`automation ${id} disappeared after draft update`);
    return detail;
  }

  async applyUpdate(id: string, appliedBy: string): Promise<IAutomationDetail> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`automation ${id} not found`);
    const draft = this.asDraft(existing.draftConfig);
    if (!draft) return existing;
    if (!this.automationTrigger.deleteMany || !this.automationAction.deleteMany) {
      throw new Error('automation apply delegates are unavailable');
    }
    await this.scheduleQueue
      ?.removeJobScheduler(`automation-schedule-${id}`)
      .catch(() => undefined);
    await this.automationTrigger.deleteMany({ where: { automationId: id } });
    await this.automationAction.deleteMany({ where: { automationId: id } });
    await this.createChildren(id, draft.triggers, draft.actions);
    await this.automation.update?.({
      where: { id },
      data: {
        ...(draft.name !== undefined ? { name: draft.name } : {}),
        ...(draft.description !== undefined ? { description: draft.description } : {}),
        ...(draft.enabled !== undefined ? { enabled: draft.enabled } : {}),
        draftConfig: null,
        liveVersion: (existing.liveVersion ?? 1) + 1,
        lastModifiedBy: appliedBy,
        lastModifiedTime: new Date(),
      },
    });
    await this.syncSchedule(id, draft.triggers);
    const detail = await this.get(id);
    if (!detail) throw new Error(`automation ${id} disappeared after apply`);
    return detail;
  }

  private asDraft(value: unknown): IAutomationDraft | null {
    if (!value || typeof value !== 'object') return null;
    const draft = value as Partial<IAutomationDraft>;
    if (!Array.isArray(draft.triggers) || !Array.isArray(draft.actions)) return null;
    return draft as IAutomationDraft;
  }

  async remove(id: string): Promise<void> {
    await this.automation.delete({ where: { id } } as never);
    await this.scheduleQueue
      ?.removeJobScheduler(`automation-schedule-${id}`)
      .catch(() => undefined);
  }

  async listRuns(automationId: string, take = 50): Promise<IAutomationRunRow[]> {
    if (!this.automationRun.findMany) return [];
    return this.automationRun.findMany({
      where: { automationId },
      orderBy: { createdTime: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
    });
  }

  async listSecretNames(
    automationId: string
  ): Promise<Array<{ name: string; maskedValue: string }>> {
    const rows = await this.automationSecret.findMany({ where: { automationId } });
    return rows.map(({ name }) => ({
      name,
      maskedValue: '••••••••',
    }));
  }

  async resolveSecrets(automationId: string): Promise<Record<string, string>> {
    const rows = await this.automationSecret.findMany({ where: { automationId } });
    const decryptor = this.secretEncryptor();
    return Object.fromEntries(
      rows.map(({ name, encryptedValue }) => [name, decryptor.decrypt(encryptedValue)])
    );
  }

  async resolveSecretsForRun(runId: string): Promise<Record<string, string>> {
    const run = await this.getRun(runId);
    return run ? this.resolveSecrets(run.automationId) : {};
  }

  async upsertSecret(
    automationId: string,
    name: string,
    value: string,
    userId: string
  ): Promise<void> {
    const cleanName = name.trim();
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(cleanName)) {
      throw new Error('secret name must be uppercase snake_case');
    }
    await this.automationSecret.upsert({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      where: { automationId_name: { automationId, name: cleanName } },
      create: {
        id: cuid(),
        automationId,
        name: cleanName,
        encryptedValue: this.secretEncryptor().encrypt(value),
        createdBy: userId,
        lastModifiedBy: userId,
      },
      update: {
        encryptedValue: this.secretEncryptor().encrypt(value),
        lastModifiedBy: userId,
        lastModifiedTime: new Date(),
      },
    });
  }

  async deleteSecret(automationId: string, name: string): Promise<void> {
    await this.automationSecret.delete({
      // eslint-disable-next-line @typescript-eslint/naming-convention
      where: { automationId_name: { automationId, name } },
    });
  }

  private secretEncryptor(): Encryptor<string> {
    const seed = process.env.SECRET_KEY ?? 'teable-automation-secret';
    return new Encryptor<string>({
      algorithm: 'aes-128-cbc',
      key: createHash('sha256').update(`${seed}:key`).digest('hex').slice(0, 16),
      iv: createHash('sha256').update(`${seed}:iv`).digest('hex').slice(0, 16),
    });
  }

  private async createChildren(
    automationId: string,
    triggers: IAutomationCreateInput['triggers'],
    actions: IAutomationCreateInput['actions']
  ): Promise<void> {
    if (triggers.length) {
      await this.automationTrigger.createMany({
        data: triggers.map((trigger) => ({
          id: cuid(),
          automationId,
          type: trigger.type,
          tableId: trigger.tableId ?? null,
          config: trigger.config ?? {},
          createdTime: new Date(),
        })),
      });
    }
    if (actions.length) {
      await this.automationAction.createMany({
        data: actions.map((action, index) => ({
          id: cuid(),
          automationId,
          type: action.type,
          orderIndex: action.orderIndex ?? index,
          config: action.config ?? {},
          createdTime: new Date(),
        })),
      });
    }
  }

  async triggerWithActions(
    automationId: string,
    input: IAutomationTriggerInput
  ): Promise<{ run: IAutomationRunRow; actions: IAutomationActionRow[] }> {
    const detail = await this.automation.findFirst({
      where: { id: automationId },
      include: { triggers: true, actions: true },
    });
    if (!detail) {
      return {
        run: {
          id: cuid(),
          automationId,
          triggerType: input.triggerType,
          status: 'skipped',
          input: input.payload,
          output: null,
          error: 'automation not found',
          retryCount: 0,
          parentRunId: null,
          version: 1,
          resumeFromStep: null,
          startedAt: null,
          finishedAt: null,
          createdTime: new Date(),
        },
        actions: [],
      };
    }
    const run = await this.trigger(automationId, input);
    return { run, actions: detail.enabled ? detail.actions : [] };
  }

  /**
   * Trigger an automation. Persists an `automation_run` row in `pending`
   * status; execution itself is left to the dispatcher (Stage 14).
   *
   * Returns the newly-created run row so the caller can hand its id back
   * to the user / API response. If the automation is disabled, the run
   * is recorded as `skipped` so the audit trail still explains what
   * would have happened.
   */
  async trigger(automationId: string, input: IAutomationTriggerInput): Promise<IAutomationRunRow> {
    const detail = await this.automation.findFirst({ where: { id: automationId } });
    const runId = cuid();
    if (!detail) {
      return {
        id: runId,
        automationId,
        triggerType: input.triggerType,
        status: 'failed',
        input: input.payload,
        output: null,
        error: `automation ${automationId} not found`,
        retryCount: 0,
        parentRunId: null,
        version: 1,
        resumeFromStep: null,
        startedAt: null,
        finishedAt: new Date(),
        createdTime: new Date(),
      };
    }
    if (!detail.enabled) {
      return this.automationRun.create({
        data: {
          id: runId,
          automationId,
          triggerType: input.triggerType,
          status: 'skipped',
          input: input.payload,
          output: null,
          error: 'automation disabled',
          retryCount: 0,
          parentRunId: null,
          version: detail.liveVersion ?? 1,
          resumeFromStep: null,
          startedAt: null,
          finishedAt: new Date(),
          createdTime: new Date(),
        },
      });
    }
    return this.automationRun.create({
      data: {
        id: runId,
        automationId,
        triggerType: input.triggerType,
        status: 'pending',
        input: input.payload,
        output: null,
        error: null,
        retryCount: 0,
        parentRunId: null,
        version: detail.liveVersion ?? 1,
        resumeFromStep: null,
        startedAt: null,
        finishedAt: null,
        createdTime: new Date(),
      },
    });
  }

  async triggerRecordEvent(args: {
    tableId: string;
    triggerType: Extract<
      IAutomationTriggerInput['triggerType'],
      'record_created' | 'record_updated' | 'record_deleted' | 'button_clicked' | 'form_submitted'
    >;
    payload: Record<string, unknown>;
    userId?: string;
  }): Promise<Array<{ run: IAutomationRunRow; actions: IAutomationActionRow[] }>> {
    const base = await this.tableMeta.findUnique({
      where: { id: args.tableId },
      select: { baseId: true },
    });
    if (!base) return [];
    const triggerTypes = [args.triggerType];
    if (args.triggerType === 'record_created' || args.triggerType === 'record_updated') {
      triggerTypes.push('record_matches_conditions' as never);
    }
    const triggers = await this.automationTrigger.findMany({
      where: { type: { in: triggerTypes }, tableId: args.tableId, automation: { enabled: true } },
      include: { automation: { include: { triggers: true, actions: true } } },
    });
    const runs: Array<{ run: IAutomationRunRow; actions: IAutomationActionRow[] }> = [];
    for (const trigger of triggers) {
      if (
        trigger.type === 'record_matches_conditions' &&
        (!this.matchesConditions(
          trigger.automation.triggers.find((candidate) => candidate.id === trigger.id)?.config,
          args.payload
        ) ||
          (args.triggerType === 'record_updated' &&
            this.matchesConditions(
              trigger.automation.triggers.find((candidate) => candidate.id === trigger.id)?.config,
              args.payload,
              true
            )))
      ) {
        continue;
      }
      const run = await this.trigger(trigger.automation.id, {
        triggerType: trigger.type as IAutomationTriggerInput['triggerType'],
        payload: { ...args.payload, baseId: base.baseId, userId: args.userId },
      });
      runs.push({ run, actions: trigger.automation.actions });
    }
    return runs;
  }

  async triggerExternalEvent(args: {
    spaceId: string;
    provider: 'feishu';
    payload: Record<string, unknown>;
  }): Promise<Array<{ run: IAutomationRunRow; actions: IAutomationActionRow[] }>> {
    const bases = await this.base.findMany({
      where: { spaceId: args.spaceId, deletedTime: null },
      select: { id: true },
    });
    if (!bases.length) return [];
    const triggers = await this.automationTrigger.findMany({
      where: {
        type: 'webhook_received',
        automation: { enabled: true, baseId: { in: bases.map(({ id }) => id) } },
      },
      include: { automation: { include: { triggers: true, actions: true } } },
    });
    const runs: Array<{ run: IAutomationRunRow; actions: IAutomationActionRow[] }> = [];
    for (const trigger of triggers) {
      const config = trigger.automation.triggers.find(
        (candidate) => candidate.id === trigger.id
      )?.config;
      if (!this.isExternalTriggerFor(config, args.provider, args.spaceId)) continue;
      const run = await this.trigger(trigger.automation.id, {
        triggerType: 'webhook_received',
        payload: { ...args.payload, spaceId: args.spaceId, provider: args.provider },
      });
      if (run.status === 'pending') runs.push({ run, actions: trigger.automation.actions });
    }
    return runs;
  }

  private isExternalTriggerFor(config: unknown, provider: 'feishu', spaceId: string): boolean {
    if (!config || typeof config !== 'object') return false;
    const value = config as { provider?: unknown; spaceId?: unknown };
    return value.provider === provider && value.spaceId === spaceId;
  }

  private async syncSchedule(
    automationId: string,
    triggers: IAutomationCreateInput['triggers']
  ): Promise<void> {
    const schedule = triggers.find((trigger) => trigger.type === 'schedule');
    if (!schedule || !this.scheduleQueue) return;
    const config = schedule.config ?? {};
    const pattern = typeof config.cron === 'string' ? config.cron : undefined;
    const every = typeof config.everyMs === 'number' ? config.everyMs : undefined;
    if (!pattern && !every) return;
    await this.scheduleQueue.add(
      AUTOMATION_SCHEDULE_JOB,
      { automationId },
      {
        jobId: `automation-schedule-${automationId}`,
        repeat: pattern ? { pattern } : { every },
        removeOnComplete: 100,
        removeOnFail: 100,
      }
    );
  }

  private matchesConditions(
    config: unknown,
    payload: Record<string, unknown>,
    previous = false
  ): boolean {
    const record = Array.isArray(payload.record) ? payload.record[0] : payload.record;
    const fields =
      record && typeof record === 'object' && 'fields' in record
        ? (record as { fields?: Record<string, unknown> }).fields ?? {}
        : {};
    const conditions =
      config && typeof config === 'object' && 'conditions' in config
        ? (config as { conditions?: IAutomationCondition[] }).conditions
        : undefined;
    if (!conditions?.length) return false;
    return conditions.every((condition) => {
      const candidate = fields[condition.fieldId];
      const actual =
        candidate &&
        typeof candidate === 'object' &&
        ('newValue' in candidate || 'oldValue' in candidate)
          ? (candidate as { newValue?: unknown; oldValue?: unknown })[
              previous ? 'oldValue' : 'newValue'
            ]
          : candidate;
      switch (condition.operator) {
        case 'equals':
          return actual === condition.value;
        case 'not_equals':
          return actual !== condition.value;
        case 'contains':
          return String(actual ?? '').includes(String(condition.value ?? ''));
        case 'greater_than':
          return Number(actual) > Number(condition.value);
        case 'less_than':
          return Number(actual) < Number(condition.value);
        case 'is_empty':
          return actual === null || actual === undefined || actual === '';
        case 'is_not_empty':
          return actual !== null && actual !== undefined && actual !== '';
      }
    });
  }

  async getRun(runId: string): Promise<IAutomationRunRow | null> {
    return this.automationRun.findFirst({ where: { id: runId } });
  }

  async getBaseIdForRun(runId: string): Promise<string | null> {
    const run = await this.getRun(runId);
    if (!run) return null;
    const detail = await this.get(run.automationId);
    return detail?.baseId ?? null;
  }

  // eslint-disable-next-line sonarjs/cognitive-complexity
  async createRetryRun(
    runId: string,
    mode: 'full' | 'resume'
  ): Promise<{
    run: IAutomationRunRow;
    actions: IAutomationActionRow[];
    resumeFromStep: number;
    previousOutput?: unknown;
  }> {
    const source = await this.getRun(runId);
    if (!source) throw new Error(`run ${runId} not found`);
    if (source.status !== 'failed') throw new Error('only failed runs can be rerun');
    const detail = await this.get(source.automationId);
    if (!detail || !detail.enabled) throw new Error('automation is unavailable for rerun');
    if (mode === 'resume' && (source.version ?? 1) !== (detail.liveVersion ?? 1)) {
      throw new Error('resume unavailable because the automation changed');
    }
    const output = source.output && typeof source.output === 'object' ? source.output : {};
    const steps = Array.isArray(output.steps) ? output.steps : [];
    const failedStep = steps.find((step): step is { index?: number; status?: string } =>
      Boolean(step && typeof step === 'object' && (step as { status?: string }).status === 'failed')
    );
    const resumeFromStep = mode === 'resume' ? failedStep?.index ?? -1 : 0;
    const hasSuccessfulPrefix =
      resumeFromStep > 0 &&
      steps.slice(0, resumeFromStep).every((step) => this.isSuccessfulStep(step));
    if (mode === 'resume' && (!hasSuccessfulPrefix || !failedStep)) {
      throw new Error('resume unavailable because no earlier step succeeded');
    }
    const retry = await this.automationRun.create({
      data: {
        id: cuid(),
        automationId: source.automationId,
        triggerType: source.triggerType,
        status: 'pending',
        input: source.input,
        output: null,
        error: null,
        retryCount: (source.retryCount ?? 0) + 1,
        parentRunId: source.parentRunId ?? source.id,
        version: detail.liveVersion ?? 1,
        resumeFromStep: mode === 'resume' ? resumeFromStep : null,
        startedAt: null,
        finishedAt: null,
        createdTime: new Date(),
      },
    });
    const previousOutput =
      mode === 'resume' && resumeFromStep > 0 ? steps[resumeFromStep - 1]?.output : undefined;
    return { run: retry, actions: detail.actions, resumeFromStep, previousOutput };
  }

  private isSuccessfulStep(step: unknown): boolean {
    return Boolean(
      step && typeof step === 'object' && (step as { status?: string }).status === 'succeeded'
    );
  }

  /**
   * Mark a run as succeeded/failed and capture output/error. Used by the
   * dispatcher after it finishes; the controller doesn't call this.
   */
  async finishRun(
    runId: string,
    patch: {
      status: 'running' | 'succeeded' | 'failed' | 'skipped';
      output?: Record<string, unknown>;
      error?: string;
    }
  ): Promise<IAutomationRunRow> {
    const isRunning = patch.status === 'running';
    return this.automationRun.update({
      where: { id: runId },
      data: {
        status: patch.status,
        output: patch.output ?? null,
        ...(patch.error !== undefined ? { error: patch.error } : {}),
        startedAt: isRunning ? new Date() : undefined,
        finishedAt: isRunning ? null : new Date(),
      },
    });
  }
}

// Re-export for module-level providers that need the row shapes.
export type {
  IAutomationActionRow,
  IAutomationDetail,
  IAutomationRow,
  IAutomationRunRow,
  IAutomationTriggerRow,
};
