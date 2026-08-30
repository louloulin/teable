import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { EventJobModule } from '../../event-emitter/event-job/event-job.module';

import { AiModule } from '../ai/ai.module';
import { AutomationActionCatalogAuthService } from '../automation-action-catalog/automation-action-catalog.auth.service';
import { AutomationTriggerCatalogAuthService } from '../automation-trigger-catalog/automation-trigger-catalog.auth.service';
import { ImBridgeModule } from '../im-bridge/im-bridge.module';
import { LicenseModule } from '../license/license.module';
import { MailSenderModule } from '../mail-sender/mail-sender.module';
import { NotificationModule } from '../notification/notification.module';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { AutomationAdminController } from './automation-admin.controller';
import { AutomationAiBuilderService } from './automation-ai-builder.service';
import { AutomationEventListener } from './automation-event.listener';
import { AutomationRateLimitService } from './automation-rate-limit.service';
import { AUTOMATION_SCHEDULE_QUEUE } from './automation-schedule.constants';
import { AutomationScheduleProcessor } from './automation-schedule.processor';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { IMBridgeService } from './im-bridge.service';
import { WebhookDispatcher } from './webhook-dispatcher.service';

/**
 * Automation module — Stage 13 + Stage 14 + Stage 15.
 *
 * Stage 13: REST surface (CRUD + trigger + run history).
 * Stage 14: Webhook outbound action dispatcher (HMAC-SHA256 + retry).
 * Stage 15: IM bridge scaffold (Slack/Discord/Telegram; WhatsApp stub).
 *
 * The dispatchers are providers, not controllers — invoked by a BullMQ
 * worker (not yet wired) or directly by a record-event hook in a later
 * stage. Exporting them lets sibling modules compose for fan-out.
 */
@Module({
  imports: [
    PrismaModule,
    AiModule,
    LicenseModule,
    MailSenderModule.register(),
    ImBridgeModule,
    NotificationModule,
    RecordOpenApiModule,
    EventJobModule.registerQueue(AUTOMATION_SCHEDULE_QUEUE),
  ],
  controllers: [AutomationController, AutomationAdminController],
  providers: [
    AutomationService,
    AutomationActionCatalogAuthService,
    AutomationTriggerCatalogAuthService,
    AutomationAiBuilderService,
    AutomationRateLimitService,
    AutomationEventListener,
    AutomationScheduleProcessor,
    WebhookDispatcher,
    IMBridgeService,
  ],
  exports: [
    AutomationService,
    AutomationActionCatalogAuthService,
    AutomationTriggerCatalogAuthService,
    WebhookDispatcher,
    IMBridgeService,
  ],
})
export class AutomationModule {}
