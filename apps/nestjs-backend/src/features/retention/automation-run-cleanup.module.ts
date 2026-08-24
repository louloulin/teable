import { Module } from '@nestjs/common';

import { EventJobModule } from '../../event-emitter/event-job/event-job.module';
import { LicenseModule } from '../license/license.module';

import {
  AUTOMATION_RUN_CLEANUP_QUEUE,
  AutomationRunCleanupProcessor,
} from './automation-run-cleanup.processor';

/**
 * NestJS module wiring the Stage 11 automation-run cleanup STUB to a
 * BullMQ queue. The processor resolves TTL from
 * `getRetentionDaysForPlan(plan, 'automation')`; the queue exists so future
 * non-stub workers can be scheduled without re-registering it.
 */
@Module({
  imports: [LicenseModule, EventJobModule.registerQueue(AUTOMATION_RUN_CLEANUP_QUEUE)],
  providers: [AutomationRunCleanupProcessor],
})
export class AutomationRunCleanupModule {}
