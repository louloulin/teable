/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Stripe Webhook NestJS module (Stage 83).
 *
 * Wires the public POST /api/stripe-webhook controller to the existing
 * StripeWebhookAuthService. Independent of BillingModule so it can be
 * imported even when billing is disabled (self-hosted free tier).
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { StripeWebhookAuthService } from './stripe-webhook.auth.service';
import { StripeWebhookController } from './stripe-webhook.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StripeWebhookController],
  providers: [StripeWebhookAuthService],
  exports: [StripeWebhookAuthService],
})
export class StripeWebhookModule {}
