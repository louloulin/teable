import { Module } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { EventJobModule } from '../../event-emitter/event-job/event-job.module';
import { LicenseModule } from '../license/license.module';

import { HttpWebhookDispatcher } from './http-webhook.dispatcher';
import { WebhookDeliveryAdminController } from './webhook-delivery.admin.controller';
import { WebhookDeliveryAuthService } from './webhook-delivery.auth.service';
import { WEBHOOK_DELIVERY_QUEUE } from './webhook-delivery.constants';
import { WebhookDeliveryListener } from './webhook-delivery.listener';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';

/**
 * Webhook delivery — module wiring (Wave 10 / T-13).
 *
 * Stage 53 originally shipped only the service layer (with no NestJS
 * module), so `WebhookDeliveryAuthService` was un-wired even though
 * its tests passed. This module:
 *
 *   - registers `WebhookDeliveryAuthService` with the `HttpWebhookDispatcher`
 *     (a production-grade `IWebhookDispatcher` that POSTs/PUTs through
 *     the global `fetch`);
 *   - exposes the admin controller that drives the dead-letter retry
 *     button on the admin panel.
 *
 * Record events are converted into endpoint-filtered deliveries and a
 * repeatable queue job dispatches due deliveries with the existing retry
 * state machine.
 */
@Module({
  imports: [EventJobModule.registerQueue(WEBHOOK_DELIVERY_QUEUE), LicenseModule],
  controllers: [WebhookDeliveryAdminController],
  providers: [
    HttpWebhookDispatcher,
    WebhookDeliveryListener,
    WebhookDeliveryProcessor,
    {
      provide: WebhookDeliveryAuthService,
      useFactory: (prisma: PrismaService, dispatcher: HttpWebhookDispatcher) =>
        new WebhookDeliveryAuthService(prisma, dispatcher),
      inject: [PrismaService, HttpWebhookDispatcher],
    },
  ],
})
export class WebhookDeliveryModule {}
