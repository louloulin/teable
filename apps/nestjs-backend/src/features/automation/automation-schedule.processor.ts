import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { AutomationEventListener } from './automation-event.listener';
import {
  AUTOMATION_SCHEDULE_JOB,
  AUTOMATION_SCHEDULE_QUEUE,
} from './automation-schedule.constants';

export { AUTOMATION_SCHEDULE_QUEUE } from './automation-schedule.constants';

@Injectable()
@Processor(AUTOMATION_SCHEDULE_QUEUE)
export class AutomationScheduleProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationScheduleProcessor.name);

  constructor(private readonly listener: AutomationEventListener) {
    super();
  }

  async process(job: Job<{ automationId: string }>): Promise<void> {
    if (job.name !== AUTOMATION_SCHEDULE_JOB) {
      this.logger.warn(`Ignoring unknown automation schedule job: ${job.name}`);
      return;
    }
    await this.listener.dispatchTrigger(job.data.automationId, 'schedule', {
      scheduledAt: new Date().toISOString(),
    });
  }
}
