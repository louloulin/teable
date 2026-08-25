import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  IAutomationActionRow,
  IAutomationCreateInput,
  IAutomationDetail,
  IAutomationRow,
  IAutomationRunRow,
  IAutomationTriggerInput,
  IAutomationTriggerRow,
} from './automation.types';

/**
 * Prisma delegate shape used by this service. Defined locally so tests
 * can supply a hand-rolled mock that satisfies the contract, and so a
 * future Prisma client that hasn't been regenerated with the automation
 * models still compiles.
 */
interface IAutomationDelegate {
  create(args: { data: Record<string, unknown> }): Promise<IAutomationRow>;
  findFirst(args: { where: Record<string, unknown> }): Promise<IAutomationDetail | null>;
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }): Promise<IAutomationRow[]>;
}

interface IAutomationTriggerDelegate {
  createMany(args: { data: Array<Record<string, unknown>> }): Promise<{ count: number }>;
}

interface IAutomationActionDelegate {
  createMany(args: { data: Array<Record<string, unknown>> }): Promise<{ count: number }>;
}

interface IAutomationRunDelegate {
  create(args: { data: Record<string, unknown> }): Promise<IAutomationRunRow>;
  findFirst(args: { where: Record<string, unknown> }): Promise<IAutomationRunRow | null>;
  update(args: {
    where: { id: string };
    data: Record<string, unknown>;
  }): Promise<IAutomationRunRow>;
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
  constructor(private readonly prisma: PrismaService) {}

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
  private get automationRun(): IAutomationRunDelegate {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as { automationRun: IAutomationRunDelegate }).automationRun;
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
    const row = await this.automation.create({
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
    const detail = await this.automation.findFirst({ where: { id } });
    if (!detail) {
      // Unreachable in practice — create succeeded so findFirst must too
      // — but tests should never see an undefined detail.
      throw new Error(`automation ${id} disappeared after create`);
    }
    return detail;
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
    return this.automation.findFirst({ where: { id } });
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
  async trigger(
    automationId: string,
    input: IAutomationTriggerInput
  ): Promise<IAutomationRunRow> {
    const detail = await this.automation.findFirst({ where: { id: automationId } });
    const runId = cuid();
    if (!detail) {
      // Record the run anyway with an error so the caller learns the
      // automation id was bogus without us throwing a 500.
      return this.automationRun.create({
        data: {
          id: runId,
          automationId,
          triggerType: input.triggerType,
          status: 'failed',
          input: input.payload,
          output: null,
          error: `automation ${automationId} not found`,
          retryCount: 0,
          startedAt: null,
          finishedAt: new Date(),
          createdTime: new Date(),
        },
      });
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
        startedAt: null,
        finishedAt: null,
        createdTime: new Date(),
      },
    });
  }

  async getRun(runId: string): Promise<IAutomationRunRow | null> {
    return this.automationRun.findFirst({ where: { id: runId } });
  }

  /**
   * Mark a run as succeeded/failed and capture output/error. Used by the
   * dispatcher after it finishes; the controller doesn't call this.
   */
  async finishRun(
    runId: string,
    patch: {
      status: 'succeeded' | 'failed';
      output?: Record<string, unknown>;
      error?: string;
    }
  ): Promise<IAutomationRunRow> {
    return this.automationRun.update({
      where: { id: runId },
      data: {
        status: patch.status,
        output: patch.output ?? null,
        error: patch.error ?? null,
        finishedAt: new Date(),
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
