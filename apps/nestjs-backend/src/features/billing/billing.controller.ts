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
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { BillingAuthService } from './billing.auth.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { PLAN_TABLE } from './billing.types';
import { Permissions } from '../auth/decorators/permissions.decorator';

const BillingGuard = LicenseCapabilityGuard.for('billing');

@Controller('api/admin/billing')
@UseGuards(BillingGuard)
export class BillingController {
  constructor(private readonly auth: BillingAuthService) {}

  @Get('subscriptions/:orgId')
  @Permissions('instance|read')
  async getSubscription(@Param('orgId') orgId: string) {
    const sub = await this.auth.getSubscription(orgId);
    return { organizationId: orgId, subscription: sub };
  }

  @Get('invoices/:orgId')
  @Permissions('instance|read')
  async listInvoices(@Param('orgId') orgId: string) {
    // listInvoices is keyed by subscriptionId; fetch via subscription first
    const sub = await this.auth.getSubscription(orgId);
    if (!sub) return { organizationId: orgId, invoices: [], total: 0 };
    const invoices = await this.auth.listInvoices({ subscriptionId: sub.id, limit: 50 });
    return { organizationId: orgId, total: invoices.length, invoices };
  }

  @Get('webhook-events/:id')
  @Permissions('instance|read')
  async getWebhookEvent(@Param('id') id: string) {
    const event = await this.auth.getWebhookEventById(id);
    if (!event) throw new NotFoundException(`webhook event not found: ${id}`);
    return event;
  }

  @Get('plans')
  @Permissions('instance|read')
  async listPlans() {
    return {
      plans: PLAN_TABLE.map((plan) => ({
        code: plan.code,
        name: plan.displayName,
        monthlyUsd: plan.monthlyCents / 100,
        seatLimit: plan.seatLimit,
      })),
    };
  }

  @Post('subscriptions/:orgId/cancel')
  @Permissions('instance|update')
  async cancelSubscription(
    @Param('orgId') orgId: string,
    @Body() body: { atPeriodEnd?: boolean }
  ) {
    const subscription = await this.auth.cancelSubscription(orgId, body?.atPeriodEnd ?? true);
    return { organizationId: orgId, status: subscription.status, subscription };
  }
}
