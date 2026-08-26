import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { LicenseCapabilityService } from '../license/license-capability.service';
import { RetentionService } from './retention.service';

export const RETENTION_QUEUE = 'retention-queue';
const RETENTION_JOB_ID = 'retention-cleanup';
// Daily at 03:00 UTC. Picked the deep-night slot to avoid overlapping the
// record-history-cold flush (04:10 on the 2nd of each month).
const RETENTION_CRON = '0 3 * * *';

/**
 * Registers and processes the daily retention cleanup job.
 *
 * Schedule creation is a best-effort, idempotent upsert: every process boot
 * ensures the scheduler exists. No process removes it (mirrors the
 * record-history-cold pattern — see that processor for the rationale).
 *
 * The fallback local queue does not support `upsertJobScheduler`, so on
 * Redis-less boots the schedule is silently skipped. The processor still
 * fires when a job is enqueued manually.
 */
@Injectable()
@Processor(RETENTION_QUEUE)
export class RetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(RetentionProcessor.name);

  constructor(
    private readonly retentionService: RetentionService,
    private readonly licenseCapabilities: LicenseCapabilityService,
    @InjectQueue(RETENTION_QUEUE) private readonly queue: Queue
  ) {
    super();
  }

  async onApplicationBootstrap(): Promise<void> {
    if (typeof this.queue.upsertJobScheduler !== 'function') {
      this.logger.warn('retention scheduler unavailable without redis');
      return;
    }
    try {
      await this.queue.upsertJobScheduler(
        RETENTION_JOB_ID,
        { pattern: RETENTION_CRON },
        { name: RETENTION_JOB_ID }
      );
      this.logger.log(`retention cleanup scheduled (cron ${RETENTION_CRON})`);
    } catch (error) {
      this.logger.error('failed to register retention scheduler', error);
    }
  }

  async process(job: Job): Promise<{ deleted: number } | undefined> {
    if (job.name !== RETENTION_JOB_ID) {
      this.logger.warn(`[retention] skipping unexpected job name=${job.name}`);
      return undefined;
    }
    const plan = this.resolvePlan();
    const result = await this.retentionService.purgeExpiredRecords(plan);
    this.logger.log(
      `[retention] job ${job.name} plan=${plan} deleted=${result.deleted}`
    );
    return result;
  }

  private resolvePlan(): 'self_hosted' | 'free' | 'pro' | 'business' | 'enterprise' {
    // The plan can be promoted by an active license; fall back to self_hosted
    // when no license is present. The retention windows are bounded by what
    // the active license allows — a business license + self_hosted install
    // still gets the business window.
    if (this.licenseCapabilities.isEnabled('admin_panel')) return 'business';
    if (this.licenseCapabilities.isEnabled('audit_log')) return 'pro';
    if (this.licenseCapabilities.isEnabled('ai_chat')) return 'free';
    return 'self_hosted';
  }
}
