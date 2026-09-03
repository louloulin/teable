import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Job } from 'bullmq';
import { AiFieldAuthService } from './ai-field.auth.service';

export const AI_FIELD_BATCH_QUEUE = 'ai-field-batch-queue';
export const AI_FIELD_BATCH_JOB = 'process';
export const AI_FIELD_BATCH_LEASE_MS = 10 * 60 * 1000;
export const AI_FIELD_BATCH_HEARTBEAT_MS = 60 * 1000;

export interface IBatchJob {
  taskId: string;
}

/**
 * Persistent worker for AI Field batch generation. The auth service still
 * owns the state machine; this processor only guarantees delivery,
 * single-flight leases, and crash recovery.
 */
@Injectable()
@Processor(AI_FIELD_BATCH_QUEUE, { concurrency: 2 })
export class AiFieldBatchProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AiFieldBatchProcessor.name);

  constructor(
    private readonly aiFieldAuth: AiFieldAuthService,
    @InjectQueue(AI_FIELD_BATCH_QUEUE)
    private readonly queue: Queue<IBatchJob>
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const recovered = await this.aiFieldAuth.recoverExpiredBatchTasks(this.queue);
    if (recovered > 0) {
      this.logger.log(`Recovered ${recovered} expired AI field batch leases on startup`);
    }
  }

  async process(job: Job<IBatchJob>): Promise<unknown> {
    if (job.name !== AI_FIELD_BATCH_JOB) {
      this.logger.warn(`Ignoring unknown AI field batch job: ${job.name}`);
      return null;
    }
    return this.aiFieldAuth.processBatchTask(job.data.taskId);
  }
}
