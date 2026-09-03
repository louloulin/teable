/**
 * AI Field admin NestJS module (V26 — Cloud §field/ai/ai-field).
 *
 * Wires the previously-orphaned AiFieldAuthService + new controller
 * so admins can manage per-field AI configurations over HTTP.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AttachmentsModule } from '../attachments/attachments.module';
import { RecordModule } from '../record/record.module';
import { RecordModifyModule } from '../record/record-modify/record-modify.module';
import { AiFieldController } from './ai-field.controller';
import { AiFieldAuthService } from './ai-field.auth.service';
import { AiFieldBatchProcessor, AI_FIELD_BATCH_QUEUE } from './ai-field-batch.processor';
import { EventJobModule } from '../../event-emitter/event-job/event-job.module';

@Module({
  imports: [
    AiModule,
    AttachmentsModule,
    RecordModule,
    RecordModifyModule,
    EventJobModule.registerQueue(AI_FIELD_BATCH_QUEUE),
  ],
  controllers: [AiFieldController],
  providers: [AiFieldAuthService, AiFieldBatchProcessor],
  exports: [AiFieldAuthService],
})
export class AiFieldModule {}
