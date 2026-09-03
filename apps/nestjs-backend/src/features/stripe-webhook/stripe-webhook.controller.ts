/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Stripe Webhook controller (Stage 83).
 *
 * Receives Stripe webhooks at POST /api/stripe-webhook. Uses raw payload
 * to verify HMAC-SHA256 signature, then dispatches to
 * StripeWebhookAuthService.ingestEvent() which dedupes + reconciles
 * internal billable lines against the Stripe invoice.
 *
 * Idempotent: same event id submitted twice returns the previous
 * reconciliation summary without re-applying side effects.
 *
 * Env:
 *   STRIPE_WEBHOOK_SECRET — shared secret used for signature verification
 *                             (rotateable via PUT /api/admin/billing/webhook-secret).
 *
 * Wire format (Stripe):
 *   header  Stripe-Signature: t=<ts>,v1=<hex-hmac-sha256>
 *   body    raw JSON: { id, type, created, data: { object: { ... invoice } } }
 *
 * License: AGPL-3.0
 */
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import { Public } from '../auth/decorators/public.decorator';
import { StripeWebhookAuthService } from './stripe-webhook.auth.service';
import type { IStripeEvent, IStripeInvoice } from './stripe-webhook.types';
import { isStripeEventKind } from './stripe-webhook.service';

interface IStripeWebhookBody {
  id?: string;
  type?: string;
  created?: number;
  data?: {
    object?: {
      id?: string;
      lines?: { data?: Array<{ id?: string; amount?: number }> };
    };
  };
}

interface IParsedStripeSig {
  timestamp: number;
  signature: string;
}

@Controller('api/stripe-webhook')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    private readonly auth: StripeWebhookAuthService,
    private readonly config: ConfigService
  ) {}

  @Public()
  @Post()
  async receive(
    @Req() req: Request,
    @Body() body: IStripeWebhookBody,
    @Headers('stripe-signature') stripeSignature?: string
  ) {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedException('webhook secret not configured');
    }
    const parsed = this.parseStripeSignature(stripeSignature);
    if (!parsed) {
      throw new UnauthorizedException('invalid Stripe-Signature header');
    }
    const rawPayload = this.extractRawPayload(req);
    const event = this.toEvent(body, parsed);
    if (!event) {
      throw new BadRequestException('unsupported or missing event payload');
    }
    const summary = await this.auth.ingestEvent({
      payload: rawPayload,
      event,
      secret,
      nowSeconds: Math.floor(Date.now() / 1000),
      now: new Date().toISOString(),
    });
    if (!summary) {
      return { received: true, deduped: true };
    }
    return { received: true, summary };
  }

  // ── helpers ───────────────────────────────────────────────────────

  /** Parse "t=<ts>,v1=<hex>" into structured form (RFC: Stripe-Signature). */
  private parseStripeSignature(header: string | undefined): IParsedStripeSig | null {
    if (!header) return null;
    const parts = header.split(',').map((p) => p.trim());
    let ts: number | undefined;
    let sig: string | undefined;
    for (const p of parts) {
      const eq = p.indexOf('=');
      if (eq < 0) continue;
      const k = p.slice(0, eq);
      const v = p.slice(eq + 1);
      if (k === 't') ts = Number(v);
      if (k === 'v1') sig = v;
    }
    if (typeof ts !== 'number' || !Number.isFinite(ts) || !sig) return null;
    return { timestamp: ts, signature: sig };
  }

  /**
   * Extract the raw payload for HMAC verification. Prefer the body
   * captured by `bodyParser.json({ verify })` if present (rawBody),
   * otherwise fall back to the already-parsed object stringified —
   * which only works when the upstream has not mutated field order.
   */
  private extractRawPayload(req: Request): string {
    const raw = (req as Request & { rawBody?: Buffer | string }).rawBody;
    if (typeof raw === 'string') return raw;
    if (raw instanceof Buffer) return raw.toString('utf8');
    if (req.body && typeof req.body === 'object') {
      return JSON.stringify(req.body);
    }
    return '';
  }

  /** Map the public Stripe envelope into our internal IStripeEvent. */
  private toEvent(body: IStripeWebhookBody, sig: IParsedStripeSig): IStripeEvent | null {
    if (!body?.id || !body.type || !Number.isFinite(body.created)) return null;
    if (!isStripeEventKind(body.type)) return null;
    const object = body.data?.object;
    const invoiceId = object?.id;
    const periodIso = new Date((body.created as number) * 1000).toISOString();
    const lineItems: import('./stripe-webhook.types').IStripeLineItem[] = (
      object?.lines?.data ?? []
    ).map((li, i) => ({
      id: li.id ?? `${body.id}-line-${i}`,
      description: '',
      amountCents: typeof li.amount === 'number' ? li.amount : 0,
      quantity: 1,
      periodStart: periodIso,
      periodEnd: periodIso,
    }));
    const totalCents = lineItems.reduce((s, li) => s + li.amountCents, 0);
    let invoice: IStripeInvoice | undefined;
    if (typeof invoiceId === 'string') {
      const safeInvoiceId: string = invoiceId;
      invoice = {
        id: safeInvoiceId,
        customerId: '',
        status: 'open',
        totalCents,
        lineItems,
        createdAt: new Date((body.created as number) * 1000).toISOString(),
      };
    }
    return {
      id: body.id,
      kind: body.type,
      createdAt: new Date((body.created as number) * 1000).toISOString(),
      invoice,
      signature: sig.signature,
      signatureTimestamp: sig.timestamp,
    };
  }
}
