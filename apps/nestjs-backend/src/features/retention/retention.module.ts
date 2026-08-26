import { Module } from '@nestjs/common';
import { ConfigModule } from '../../configs/config.module';
import { EventJobModule } from '../../event-emitter/event-job/event-job.module';
import { LicenseModule } from '../license/license.module';
import { RETENTION_QUEUE, RetentionProcessor } from './retention.processor';
import { RetentionService } from './retention.service';

/**
 * Retention cleanup module.
 *
 * Reuses the existing EventJobModule.registerQueue helper so the retention
 * queue falls back to the in-process event emitter when Redis is unavailable
 * (CI, unit tests, dev-mode single-process). The processor's
 * upsertJobScheduler guard skips scheduler registration in that case — only
 * the worker side stays live.
 */
@Module({
  imports: [
    ConfigModule,
    LicenseModule,
    EventJobModule.registerQueue(RETENTION_QUEUE),
  ],
  providers: [RetentionService, RetentionProcessor],
  exports: [RetentionService],
})
export class RetentionModule {}
