import { Module } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { HttpWebhookDispatcher } from './http-webhook.dispatcher';
import { WebhookDeliveryAdminController } from './webhook-delivery.admin.controller';
import { WebhookDeliveryAuthService } from './webhook-delivery.auth.service';

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
 * The BullMQ worker that picks up due deliveries is still a follow-up —
 * for now, only `enqueue` / `dispatchOne` / `listDue` / `retry` are
 * reachable, and the admin retry path is what the panel consumes.
 */
@Module({
  controllers: [WebhookDeliveryAdminController],
  providers: [
    HttpWebhookDispatcher,
    {
      provide: WebhookDeliveryAuthService,
      useFactory: (prisma: PrismaService, dispatcher: HttpWebhookDispatcher) =>
        new WebhookDeliveryAuthService(prisma, dispatcher),
      inject: [PrismaService, HttpWebhookDispatcher],
    },
  ],
})
export class WebhookDeliveryModule {}
