import {
  BadRequestException,
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Permissions } from '../auth/decorators/permissions.decorator';
import type { BillingPlanCode } from './billing.types';

/**
 * Stripe Checkout controller.
 *
 * Creates a Stripe Checkout Session for the requested plan and returns
 * the redirect URL. Uses Stripe's REST API via fetch() — no extra SDK
 * dependency. The host must set STRIPE_SECRET_KEY + STRIPE_PRICE_ID_*
 * env vars; otherwise this endpoint returns 503.
 *
 * After payment, Stripe sends a webhook to /api/stripe-webhook which
 * (via stripe-webhook.auth.service) calls billing.auth.receiveWebhook
 * to materialize the subscription + invoice rows.
 *
 * Routes:
 *   POST /api/billing/checkout
 *     body: { organizationId, planCode, seats?, successUrl?, cancelUrl? }
 *     → { sessionId, url } (frontend redirects to `url`)
 */
@Controller('api/billing')
export class BillingCheckoutController {
  private static readonly STRIPE_API = 'https://api.stripe.com/v1/checkout/sessions';

  constructor(private readonly config: ConfigService) {}

  @Post('checkout')
  @Permissions('space|update')
  async checkout(
    @Body()
    body: {
      organizationId: string;
      planCode: BillingPlanCode;
      seats?: number;
      successUrl?: string;
      cancelUrl?: string;
    }
  ): Promise<{ sessionId: string; url: string }> {
    if (!body?.organizationId || !body?.planCode) {
      throw new BadRequestException('organizationId, planCode required');
    }
    const secret = this.config.get<string>('STRIPE_SECRET_KEY');
    if (!secret) {
      throw new ServiceUnavailableException(
        'Stripe is not configured. Set STRIPE_SECRET_KEY to enable checkout.'
      );
    }
    const priceId = this.priceIdFor(body.planCode);
    if (!priceId) {
      throw new BadRequestException(
        `no Stripe price configured for plan: ${body.planCode}. Set STRIPE_PRICE_ID_${body.planCode.toUpperCase()}.`
      );
    }
    const successUrl =
      body.successUrl ?? this.config.get<string>('STRIPE_SUCCESS_URL') ?? '';
    const cancelUrl =
      body.cancelUrl ?? this.config.get<string>('STRIPE_CANCEL_URL') ?? '';
    if (!successUrl || !cancelUrl) {
      throw new BadRequestException('successUrl and cancelUrl required');
    }

    // Build x-www-form-urlencoded body for Stripe REST API.
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);
    params.append('client_reference_id', body.organizationId);
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', String(body.seats ?? 1));
    params.append('metadata[organizationId]', body.organizationId);
    params.append('metadata[planCode]', body.planCode);

    const res = await fetch(BillingCheckoutController.STRIPE_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new ServiceUnavailableException(`Stripe error ${res.status}: ${text}`);
    }
    const session = (await res.json()) as { id: string; url: string };
    return { sessionId: session.id, url: session.url };
  }

  private priceIdFor(plan: BillingPlanCode): string | undefined {
    const key = `STRIPE_PRICE_ID_${plan.toUpperCase()}`;
    return this.config.get<string>(key);
  }
}
