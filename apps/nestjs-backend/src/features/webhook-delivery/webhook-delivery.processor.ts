import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Job } from 'bullmq';

import { WebhookDeliveryAuthService } from './webhook-delivery.auth.service';
import {
  WEBHOOK_DELIVERY_DISPATCH_JOB,
  WEBHOOK_DELIVERY_QUEUE,
  WEBHOOK_DELIVERY_REPEAT_MS,
} from './webhook-delivery.constants';

@Injectable()
@Processor(WEBHOOK_DELIVERY_QUEUE, { concurrency: 4 })
export class WebhookDeliveryProcessor extends WorkerHost implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);
  private started = false;

  constructor(
    private readonly deliveries: WebhookDeliveryAuthService,
    @InjectQueue(WEBHOOK_DELIVERY_QUEUE) private readonly queue: Queue
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.queue.add(
      WEBHOOK_DELIVERY_DISPATCH_JOB,
      {},
      {
        jobId: `${WEBHOOK_DELIVERY_DISPATCH_JOB}-repeat`,
        repeat: { every: WEBHOOK_DELIVERY_REPEAT_MS },
        removeOnComplete: 50,
        removeOnFail: 100,
      }
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }

  async process(job: Job<unknown>): Promise<{ dispatched: number; failed: number }> {
    if (job.name !== WEBHOOK_DELIVERY_DISPATCH_JOB) {
      this.logger.warn(`Ignoring unknown webhook delivery job: ${job.name}`);
      return { dispatched: 0, failed: 0 };
    }

    const due = await this.deliveries.listDue();
    let dispatched = 0;
    let failed = 0;
    for (const delivery of due) {
      try {
        await this.deliveries.dispatchOne({ delivery });
        dispatched += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Webhook delivery ${delivery.id} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return { dispatched, failed };
  }
}
