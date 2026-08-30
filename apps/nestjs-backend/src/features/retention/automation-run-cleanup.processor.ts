import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import type { Job } from 'bullmq';
import { Queue } from 'bullmq';

import { LicenseCapabilityService } from '../license/license-capability.service';

import { getRetentionDaysForPlan, MS_PER_DAY } from './retention-policy';

export const AUTOMATION_RUN_CLEANUP_QUEUE = 'automation-run-cleanup-queue';

/** BullMQ job name used by the stub. Colon-free so future custom-id
 *  chaining (if/when a real automation_run table exists) cannot trip
 *  BullMQ's "Custom Id cannot contain :" rule the way the cold-flush
 *  chain once did (see record-history-cold.processor). */
export const AUTOMATION_RUN_CLEANUP_TICK_JOB = 'automation-run-cleanup-tick';
export const AUTOMATION_RUN_CLEANUP_REPEAT_MS = 60 * 60 * 1000;

export interface IAutomationRunCleanupTickResult {
  plan: string;
  kind: 'automation';
  /** retention TTL used for the fallback path, in days */
  days: number;
  /** ISO timestamp used by the fallback path */
  cutoff: string;
  deleted: number;
  spaces: number;
}

interface ISpaceQuotaRow {
  spaceId: string;
  plan: string;
  automationHistoryDays: number | null;
}

interface IAutomationRunDelegate {
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

interface ISpaceQuotaDelegate {
  findMany(args: { select: Record<string, boolean> }): Promise<ISpaceQuotaRow[]>;
}

interface IBaseDelegate {
  findMany(args: {
    where: { spaceId: { in: string[] } };
    select: { id: boolean };
  }): Promise<Array<{ id: string }>>;
}

interface IAutomationDelegate {
  findMany(args: {
    where: { baseId: { in: string[] } };
    select: { id: boolean };
  }): Promise<Array<{ id: string }>>;
}

interface IPrismaRetentionClient {
  automationRun: IAutomationRunDelegate;
  spaceQuota: ISpaceQuotaDelegate;
  base: IBaseDelegate;
  automation: IAutomationDelegate;
}

@Injectable()
@Processor(AUTOMATION_RUN_CLEANUP_QUEUE)
export class AutomationRunCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationRunCleanupProcessor.name);
  private started = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly caps: LicenseCapabilityService,
    @InjectQueue(AUTOMATION_RUN_CLEANUP_QUEUE) private readonly queue: Queue
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.queue.add(
      AUTOMATION_RUN_CLEANUP_TICK_JOB,
      {},
      {
        jobId: AUTOMATION_RUN_CLEANUP_TICK_JOB,
        repeat: { every: AUTOMATION_RUN_CLEANUP_REPEAT_MS },
        removeOnComplete: 50,
        removeOnFail: 100,
      }
    );
    this.logger.log(`scheduled automation-run cleanup every ${AUTOMATION_RUN_CLEANUP_REPEAT_MS}ms`);
  }

  async process(job: Job): Promise<IAutomationRunCleanupTickResult> {
    const plan = this.caps.currentPlan();
    const days = getRetentionDaysForPlan(plan, 'automation');
    const fallbackCutoff = new Date(Date.now() - days * MS_PER_DAY);
    if (job.name !== AUTOMATION_RUN_CLEANUP_TICK_JOB) {
      this.logger.warn(
        `automation-run cleanup: ignoring unknown job name "${job.name}" (id=${job.id ?? 'n/a'})`
      );
      return {
        plan,
        kind: 'automation',
        days,
        cutoff: fallbackCutoff.toISOString(),
        deleted: 0,
        spaces: 0,
      };
    }

    const prisma = this.prisma as unknown as IPrismaRetentionClient;
    const quotas = await prisma.spaceQuota.findMany({
      select: { spaceId: true, plan: true, automationHistoryDays: true },
    });
    const fallback =
      quotas.length === 0
        ? await prisma.automationRun.deleteMany({
            where: { createdTime: { lt: fallbackCutoff } },
          })
        : { count: 0 };
    let deleted = fallback.count;
    const spaces = quotas.length === 0 ? 0 : quotas.length;

    const grouped = new Map<number, { cutoff: Date; spaceIds: string[] }>();
    for (const quota of quotas) {
      if (quota.automationHistoryDays === null) continue;
      const cutoff = new Date(Date.now() - quota.automationHistoryDays * MS_PER_DAY);
      const key = quota.automationHistoryDays;
      const group = grouped.get(key) ?? { cutoff, spaceIds: [] };
      group.spaceIds.push(quota.spaceId);
      grouped.set(key, group);
    }
    for (const group of grouped.values()) {
      const bases = await prisma.base.findMany({
        where: { spaceId: { in: group.spaceIds } },
        select: { id: true },
      });
      if (bases.length === 0) continue;
      const automations = await prisma.automation.findMany({
        where: { baseId: { in: bases.map((base) => base.id) } },
        select: { id: true },
      });
      if (automations.length === 0) continue;
      const result = await prisma.automationRun.deleteMany({
        where: {
          createdTime: { lt: group.cutoff },
          automationId: { in: automations.map((automation) => automation.id) },
        },
      });
      deleted += result.count;
    }

    const result: IAutomationRunCleanupTickResult = {
      plan,
      kind: 'automation',
      days,
      cutoff: fallbackCutoff.toISOString(),
      deleted,
      spaces,
    };
    this.logger.log(
      `automation-run cleanup tick: plan=${plan} days=${days} deleted=${deleted} spaces=${spaces}`
    );
    return result;
  }
}
