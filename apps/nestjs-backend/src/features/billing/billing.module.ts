import { Module } from '@nestjs/common';
import { ConfigModule } from '../../configs/config.module';
import { PrismaModule } from '@teable/db-main-prisma';

import { BillingAuthService } from './billing.auth.service';
import { BillingController } from './billing.controller';
import { BillingCheckoutController } from './billing-checkout.controller';

/**
 * Billing HTTP module.
 *
 * Wires the existing BillingAuthService (subscription + invoice CRUD +
 * webhook ingestion) to HTTP. Adds a thin Stripe Checkout endpoint that
 * uses Stripe's REST API via fetch() — no extra npm dependency required.
 *
 * Environment variables (set them on the host to enable real Stripe):
 *   STRIPE_SECRET_KEY              sk_live_… / sk_test_…
 *   STRIPE_PRICE_ID_PRO            price_… (Pro monthly)
 *   STRIPE_PRICE_ID_BUSINESS       price_… (Business monthly)
 *   STRIPE_SUCCESS_URL             https://app.example.com/billing/success
 *   STRIPE_CANCEL_URL              https://app.example.com/billing
 *
 * Without these env vars the checkout endpoint returns 503 — billing is
 * fully functional otherwise (subscription queries, invoices, webhooks).
 *
 * Routes:
 *   GET    /api/billing/subscription/:orgId            current subscription
 *   POST   /api/billing/subscription                   create subscription
 *   POST   /api/billing/subscription/:orgId/cancel     cancel subscription
 *   GET    /api/billing/invoices                       list invoices
 *   GET    /api/billing/plans                          static plan catalog
 *   POST   /api/billing/checkout                       create Stripe Checkout session
 */
@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [BillingController, BillingCheckoutController],
  providers: [BillingAuthService],
  exports: [BillingAuthService],
})
export class BillingModule {}
