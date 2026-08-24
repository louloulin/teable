import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { LicenseCapabilityService } from '../license/license-capability.service';

import { getRetentionDaysForPlan, MS_PER_DAY } from './retention-policy';

export const AUTOMATION_RUN_CLEANUP_QUEUE = 'automation-run-cleanup-queue';

/** BullMQ job name used by the stub. Colon-free so future custom-id
 *  chaining (if/when a real automation_run table exists) cannot trip
 *  BullMQ's "Custom Id cannot contain :" rule the way the cold-flush
 *  chain once did (see record-history-cold.processor). */
export const AUTOMATION_RUN_CLEANUP_TICK_JOB = 'automation-run-cleanup-tick';

export interface IAutomationRunCleanupTickResult {
  plan: string;
  kind: 'automation';
  /** retention TTL resolved from the current plan, in days */
  days: number;
  /** ISO timestamp of the cleanup cutoff that a real worker would use */
  cutoff: string;
}

/**
 * Stage 11 STUB.
 *
 * The OSS tree does not ship an `automation_run` table, so there is no
 * existing cleanup body to rewire — the spec (§3.3) is satisfied by
 * registering the queue and resolving the TTL from `getRetentionDaysForPlan`.
 *
 * Wiring a real cleanup service is intentionally NOT done here:
 *   - `teableio/teable-ee` owns the production automation_run path; copying
 *     it would violate supervisor Non-goals ("不复制 teableio/teable-ee 任何源代码").
 *   - inventing a fresh delete path without a table or call-site is just
 *     dead code with no test surface.
 *
 * When the OSS gets an automation_run table, swap `process()` for a service
 * call that uses the same `days` value to drive a DELETE WHERE created_at
 * < cutoff — the queue, job name, and module surface stay stable.
 */
@Injectable()
@Processor(AUTOMATION_RUN_CLEANUP_QUEUE)
export class AutomationRunCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationRunCleanupProcessor.name);

  constructor(private readonly caps: LicenseCapabilityService) {
    super();
  }

  async process(job: Job): Promise<IAutomationRunCleanupTickResult> {
    if (job.name !== AUTOMATION_RUN_CLEANUP_TICK_JOB) {
      // ignore jobs not addressed at us; bullmq routes by queue name but a
      // misconfigured producer could still enqueue a different name here.
      this.logger.warn(
        `automation-run cleanup: ignoring unknown job name "${job.name}" (id=${job.id ?? 'n/a'})`
      );
      const plan = this.caps.currentPlan();
      return {
        plan,
        kind: 'automation',
        days: getRetentionDaysForPlan(plan, 'automation'),
        cutoff: new Date().toISOString(),
      };
    }
    const plan = this.caps.currentPlan();
    const days = getRetentionDaysForPlan(plan, 'automation');
    const cutoff = new Date(Date.now() - days * MS_PER_DAY);
    const result: IAutomationRunCleanupTickResult = {
      plan,
      kind: 'automation',
      days,
      cutoff: cutoff.toISOString(),
    };
    this.logger.log(
      `automation-run cleanup tick: plan=${plan} days=${days} cutoff=${result.cutoff}`
    );
    return result;
  }
}
