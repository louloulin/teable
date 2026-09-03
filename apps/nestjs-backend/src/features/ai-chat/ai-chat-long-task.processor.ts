import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Job } from 'bullmq';
import {
  AI_CHAT_LONG_TASK_QUEUE,
  AiChatLongTaskService,
  type ILongTaskJob,
} from './ai-chat-long-task.service';

@Injectable()
@Processor(AI_CHAT_LONG_TASK_QUEUE, { concurrency: 2 })
export class AiChatLongTaskProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(AiChatLongTaskProcessor.name);

  constructor(
    private readonly longTasks: AiChatLongTaskService,
    @InjectQueue(AI_CHAT_LONG_TASK_QUEUE) private readonly queue: Queue<ILongTaskJob>
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    const recovered = await this.longTasks.recoverExpiredTasks();
    if (recovered > 0) {
      this.logger.log(`Recovered ${recovered} expired AI long task leases on startup`);
    }
  }

  async process(job: Job<ILongTaskJob>) {
    if (job.name !== 'process') {
      this.logger.warn(`Ignoring unknown AI long task job: ${job.name}`);
      return null;
    }
    return this.longTasks.processTask(job.data.taskId);
  }
}
