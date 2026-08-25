import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
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
  imports: [PrismaModule, LicenseModule],
  controllers: [AutomationController],
  providers: [AutomationService, WebhookDispatcher, IMBridgeService],
  exports: [AutomationService, WebhookDispatcher, IMBridgeService],
})
export class AutomationModule {}
