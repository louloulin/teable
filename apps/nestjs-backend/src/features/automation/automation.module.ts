import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { WebhookDispatcher } from './webhook-dispatcher.service';

/**
 * Automation module — Stage 13 + Stage 14.
 *
 * Stage 13: REST surface (CRUD + trigger + run history).
 * Stage 14: Webhook outbound action dispatcher (HMAC-SHA256 + retry).
 *
 * The dispatcher is a provider, not a controller — it's invoked by a
 * BullMQ worker (not yet wired) or directly by a record-event hook in
 * a later stage. Exporting it lets sibling modules (IM bridge, SMTP)
 * compose it for fan-out.
 */
@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [AutomationController],
  providers: [AutomationService, WebhookDispatcher],
  exports: [AutomationService, WebhookDispatcher],
})
export class AutomationModule {}
