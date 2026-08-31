import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { Permissions } from '../auth/decorators/permissions.decorator';
import { BillingAuthService } from './billing.auth.service';
import type {
  BillingPlanCode,
  ICreateSubscriptionInput,
  IInvoice,
  ISubscription,
} from './billing.types';

/**
 * Billing HTTP controller.
 *
 * Thin layer over BillingAuthService. Exposes per-org subscription,
 * invoice queries, and subscription lifecycle (create + cancel). The
 * actual Stripe Checkout flow lives in billing-checkout.controller.ts.
 *
 * Auth model: requires `space|read` or `space|update` — billing data is
 * scoped to a space (= organization), not a base.
 */
@Controller('api/billing')
export class BillingController {
  constructor(private readonly auth: BillingAuthService) {}

  @Get('subscription/:orgId')
  @Permissions('space|read')
  async getSubscription(
    @Param('orgId') orgId: string
  ): Promise<{ subscription: ISubscription | null }> {
    const subscription = await this.auth.getSubscription(orgId);
    return { subscription };
  }

  @Post('subscription')
  @Permissions('space|update')
  async createSubscription(@Body() body: ICreateSubscriptionInput): Promise<ISubscription> {
    if (!body?.organizationId || !body?.planCode || !body?.externalSubscriptionId) {
      throw new BadRequestException(
        'organizationId, planCode, externalSubscriptionId required'
      );
    }
    return this.auth.createSubscription(body);
  }

  @Post('subscription/:orgId/cancel')
  @Permissions('space|update')
  async cancelSubscription(
    @Param('orgId') orgId: string,
    @Body() body: { atPeriodEnd?: boolean }
  ): Promise<ISubscription> {
    return this.auth.cancelSubscription(orgId, body?.atPeriodEnd ?? true);
  }

  @Get('invoices')
  @Permissions('space|read')
  async listInvoices(
    @Query('subscriptionId') subscriptionId?: string,
    @Query('limit') limit?: string
  ): Promise<{ invoices: IInvoice[]; count: number }> {
    const parsed = limit !== undefined ? parseInt(limit, 10) : undefined;
    const input: { subscriptionId?: string; limit?: number } = {};
    if (subscriptionId) input.subscriptionId = subscriptionId;
    if (parsed !== undefined && Number.isFinite(parsed)) input.limit = parsed;
    const invoices = await this.auth.listInvoices(input);
    return { invoices, count: invoices.length };
  }

  /**
   * Static plan catalog used by the frontend dashboard to render pricing
   * cards. Mirrors the Cloud docs — Stripe price ids are not exposed
   * here; those live server-side and are referenced from the checkout
   * endpoint.
   */
  @Get('plans')
  @Permissions('space|read')
  plans(): {
    plans: Array<{
      code: BillingPlanCode;
      name: string;
      monthlyUsd: number;
      features: string[];
    }>;
  } {
    return {
      plans: [
        {
          code: 'free',
          name: 'Free',
          monthlyUsd: 0,
          features: ['Unlimited bases', 'Up to 5 collaborators', 'Community support'],
        },
        {
          code: 'pro',
          name: 'Pro',
          monthlyUsd: 12,
          features: ['All Free features', 'Unlimited collaborators', 'AI Chat', 'App Builder'],
        },
        {
          code: 'team',
          name: 'Team',
          monthlyUsd: 24,
          features: ['All Pro features', 'Custom roles', 'Audit log', 'Priority support'],
        },
        {
          code: 'business',
          name: 'Business',
          monthlyUsd: 48,
          features: [
            'All Team features',
            'SSO / SAML',
            'SCIM provisioning',
            'Custom domain',
            'Dedicated support',
          ],
        },
        {
          code: 'enterprise',
          name: 'Enterprise',
          monthlyUsd: 0,
          features: ['All Business features', 'Self-hosted option', 'BYOK KMS', 'SLA'],
        },
      ],
    };
  }
}
