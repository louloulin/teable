/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — admin HTTP controller (Round-INFRA-4).
 *
 * Surfaces Stripe-shaped billing views for the admin panel:
 *   GET /api/admin/billing/subscriptions/:orgId
 *   GET /api/admin/billing/invoices/:orgId
 *   GET /api/admin/billing/webhook-events/:id
 *
 * Wire-side mutations stay on BillingAuthService (called by Stripe
 * webhook handlers + internal subscription flows).
 *
 * License: AGPL-3.0
 */
import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';

import { BillingAuthService } from './billing.auth.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';

const BillingGuard = LicenseCapabilityGuard.for('sso');

@Controller('api/admin/billing')
@UseGuards(BillingGuard)
export class BillingController {
  constructor(private readonly auth: BillingAuthService) {}

  @Get('subscriptions/:orgId')
  async getSubscription(@Param('orgId') orgId: string) {
    const sub = await this.auth.getSubscription(orgId);
    return { organizationId: orgId, subscription: sub };
  }

  @Get('invoices/:orgId')
  async listInvoices(@Param('orgId') orgId: string) {
    // listInvoices is keyed by subscriptionId; fetch via subscription first
    const sub = await this.auth.getSubscription(orgId);
    if (!sub) return { organizationId: orgId, invoices: [], total: 0 };
    const invoices = await this.auth.listInvoices({ subscriptionId: sub.id, limit: 50 });
    return { organizationId: orgId, total: invoices.length, invoices };
  }

  @Get('webhook-events/:id')
  async getWebhookEvent(@Param('id') id: string) {
    const event = await this.auth.getWebhookEventById(id);
    if (!event) throw new NotFoundException(`webhook event not found: ${id}`);
    return event;
  }
}
