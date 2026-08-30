import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { EventJobModule } from '../../event-emitter/event-job/event-job.module';
import { LicenseModule } from '../license/license.module';

import {
  AUTOMATION_RUN_CLEANUP_QUEUE,
  AutomationRunCleanupProcessor,
} from './automation-run-cleanup.processor';

/**
 * NestJS module wiring the automation-run cleanup processor to a BullMQ
 * queue. Retention is resolved per space from `space_quota`.
 */
@Module({
  imports: [
    PrismaModule,
    LicenseModule,
    EventJobModule.registerQueue(AUTOMATION_RUN_CLEANUP_QUEUE),
  ],
  providers: [AutomationRunCleanupProcessor],
})
export class AutomationRunCleanupModule {}
