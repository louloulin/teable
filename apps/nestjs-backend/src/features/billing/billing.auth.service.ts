import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applySubscriptionUpdate,
  buildInvoiceRow,
  buildSubscriptionRow,
  buildWebhookEventId,
  isValidInvoiceTransition,
  isValidSubscriptionTransition,
  parseEventPayload,
} from './billing.service';
import {
  BillingProrationService,
  type IPlanChangePreviewInput,
  type IPlanRate,
  type IProrationPreview,
  type ISeatChangePreviewInput,
} from './billing-proration.service';
import { BillingDunningService } from './billing-dunning.service';
import type {
  BillingPlanCode,
  ICreateInvoiceInput,
  ICreateSubscriptionInput,
  IInvoice,
  IResolvedWebhook,
  ISubscription,
  IUpdateSubscriptionInput,
  IWebhookEvent,
  SubscriptionStatus,
} from './billing.types';

/**
 * Billing orchestrator — Stage 32.
 *
 * CRUD over Subscription/Invoice + idempotent webhook event handler.
 */
@Injectable()
export class BillingAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly proration: BillingProrationService,
    private readonly dunning: BillingDunningService
  ) {}

  async createSubscription(input: ICreateSubscriptionInput): Promise<ISubscription> {
    const existing = await this.prisma.subscription.findUnique({
      where: { organizationId: input.organizationId },
    });
    if (existing)
      throw new ConflictException(`subscription already exists for org ${input.organizationId}`);
    const dupExt = await this.prisma.subscription.findUnique({
      where: { externalSubscriptionId: input.externalSubscriptionId },
    });
    if (dupExt)
      throw new ConflictException(
        `external subscription already known: ${input.externalSubscriptionId}`
      );
    const id = `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildSubscriptionRow({ ...input, id });
    const created = await this.prisma.subscription.create({
      data: {
        id: row.id,
        organizationId: row.organizationId,
        planCode: row.planCode,
        status: row.status,
        externalSubscriptionId: row.externalSubscriptionId,
        externalCustomerId: row.externalCustomerId,
        currentPeriodStart: row.currentPeriodStart,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
        canceledAt: row.canceledAt,
        seats: row.seats,
      },
    });
    return toSubRow(created);
  }

  async updateSubscription(
    organizationId: string,
    update: IUpdateSubscriptionInput
  ): Promise<ISubscription> {
    const existing = await this.prisma.subscription.findUnique({ where: { organizationId } });
    if (!existing) throw new NotFoundException(`subscription not found: ${organizationId}`);
    if (
      update.status &&
      !isValidSubscriptionTransition(existing.status as SubscriptionStatus, update.status)
    ) {
      throw new BadRequestException(
        `invalid status transition: ${existing.status} → ${update.status}`
      );
    }
    const merged = applySubscriptionUpdate(toSubRow(existing), update);
    const updated = await this.prisma.subscription.update({
      where: { organizationId },
      data: {
        planCode: merged.planCode,
        status: merged.status,
        currentPeriodStart: merged.currentPeriodStart,
        currentPeriodEnd: merged.currentPeriodEnd,
        cancelAtPeriodEnd: merged.cancelAtPeriodEnd,
        canceledAt: merged.canceledAt,
        seats: merged.seats,
      },
    });
    await this.dunningSideEffectOnStatusChange({
      organizationId,
      prevStatus: existing.status as SubscriptionStatus,
      nextStatus: merged.status,
      reason: `status_transition:${existing.status}->${merged.status}`,
    });
    return toSubRow(updated);
  }

  /**
   * Phase 5.3 — dunning side-effect. Called after the subscription row
   * has been updated (or by receiveWebhook when a webhook payload signals
   * a transition directly).
   *
   * - nextStatus === 'past_due'         → open a recovery plan (idempotent)
   * - prevStatus === 'past_due' &&
   *   nextStatus === 'canceled'         → close plan as `completed`
   * - prevStatus === 'past_due' &&
   *   nextStatus in {active, trialing}  → close plan as `recovered`
   */
  async dunningSideEffectOnStatusChange(input: {
    organizationId: string;
    prevStatus: SubscriptionStatus;
    nextStatus: SubscriptionStatus;
    reason?: string;
    asOf?: Date;
  }): Promise<void> {
    const { prevStatus, nextStatus, organizationId, reason, asOf } = input;
    if (nextStatus === 'past_due') {
      await this.dunning.scheduleRecoverySteps({
        subscriptionId: organizationId,
        reason: reason ?? `status_transition:${prevStatus}->past_due`,
        ...(asOf ? { asOf } : {}),
      });
      return;
    }
    // After the early return above, nextStatus !== 'past_due'. Recover
    // only when prevStatus was past_due. We widen prevStatus via the
    // stored input to sidestep TS control-flow narrowing on the literal
    // comparison above.
    const prev = input.prevStatus as SubscriptionStatus;
    if (prev === 'past_due') {
      if (nextStatus === 'canceled') {
        await this.dunning.cancelOnHardCancel({
          subscriptionId: organizationId,
          ...(asOf ? { asOf } : {}),
        });
      } else {
        await this.dunning.cancelOnRecovery({
          subscriptionId: organizationId,
          ...(asOf ? { asOf } : {}),
        });
      }
    }
  }

  async cancelSubscription(organizationId: string, atPeriodEnd: boolean): Promise<ISubscription> {
    return this.updateSubscription(organizationId, {
      status: atPeriodEnd ? undefined : 'canceled',
      cancelAtPeriodEnd: atPeriodEnd,
      canceledAt: atPeriodEnd ? null : new Date(),
    });
  }

  async getSubscription(organizationId: string): Promise<ISubscription | null> {
    const row = await this.prisma.subscription.findUnique({ where: { organizationId } });
    return row ? toSubRow(row) : null;
  }

  async createInvoice(input: ICreateInvoiceInput): Promise<IInvoice> {
    const dup = await this.prisma.invoice.findUnique({
      where: { externalInvoiceId: input.externalInvoiceId },
    });
    if (dup) throw new ConflictException(`invoice already known: ${input.externalInvoiceId}`);
    const id = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildInvoiceRow({ ...input, id });
    const created = await this.prisma.invoice.create({
      data: {
        id: row.id,
        subscriptionId: row.subscriptionId,
        externalInvoiceId: row.externalInvoiceId,
        amountCents: row.amountCents,
        currency: row.currency,
        status: row.status,
        issuedAt: row.issuedAt,
        periodStart: row.periodStart,
        periodEnd: row.periodEnd,
        paidAt: row.paidAt,
      },
    });
    return toInvoiceRow(created);
  }

  async markInvoicePaid(externalInvoiceId: string): Promise<IInvoice> {
    const existing = await this.prisma.invoice.findUnique({ where: { externalInvoiceId } });
    if (!existing) throw new NotFoundException(`invoice not found: ${externalInvoiceId}`);
    if (!isValidInvoiceTransition(existing.status as IInvoice['status'], 'paid')) {
      throw new BadRequestException(`cannot mark paid from ${existing.status}`);
    }
    const updated = await this.prisma.invoice.update({
      where: { externalInvoiceId },
      data: { status: 'paid', paidAt: new Date() },
    });
    return toInvoiceRow(updated);
  }

  async listInvoices(input: { subscriptionId?: string; limit?: number }): Promise<IInvoice[]> {
    const rows = await this.prisma.invoice.findMany({
      where: input.subscriptionId ? { subscriptionId: input.subscriptionId } : {},
      take: Math.min(input.limit ?? 50, 500),
      orderBy: { issuedAt: 'desc' },
    });
    return rows.map(toInvoiceRow);
  }

  /**
   * Idempotent webhook receive.
   * - Reuses existing event by externalEventId
   * - Stores the payload even if malformed (for forensics)
   */
  async receiveWebhook(input: {
    externalEventId: string;
    eventType: string;
    payload: string;
  }): Promise<IResolvedWebhook> {
    const id = buildWebhookEventId(input.externalEventId);
    const existing = await this.prisma.webhookEvent.findUnique({ where: { id } });
    if (existing) {
      const payload = parseEventPayload(existing.payloadJson) ?? {};
      return { event: toEventRow(existing), alreadyProcessed: !!existing.processedAt, payload };
    }
    const created = await this.prisma.webhookEvent.create({
      data: {
        id,
        externalEventId: input.externalEventId,
        eventType: input.eventType,
        payloadJson: input.payload,
      },
    });
    const payload = parseEventPayload(input.payload) ?? {};
    await this.dunningSideEffectForWebhook({
      eventType: input.eventType,
      payload,
    });
    return { event: toEventRow(created), alreadyProcessed: false, payload };
  }

  /**
   * Inspect a freshly-arrived webhook payload for a subscription
   * status transition and propagate it to the dunning scheduler.
   *
   * Supports both Stripe-nested shape
   * (`{ data: { object: { id, status } } }`) and a flat shape for
   * internal fixtures (`{ subscriptionExternalId, status }`). The lookup
   * is by `externalSubscriptionId` (the same value Stripe gave us, not
   * the local subscription PK).
   */
  async dunningSideEffectForWebhook(input: {
    eventType: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const { eventType, payload } = input;
    if (!eventType.startsWith('customer.subscription.') && eventType !== 'subscription.updated') {
      return;
    }
    const objectNode =
      (payload.data as Record<string, unknown> | undefined)?.object ??
      (payload.object as Record<string, unknown> | undefined);
    if (!objectNode || typeof objectNode !== 'object') return;

    const obj = objectNode as Record<string, unknown>;
    const nextStatus = obj.status;
    const externalId = obj.id ?? obj.subscriptionExternalId ?? obj.subscription_id;
    if (typeof nextStatus !== 'string' || typeof externalId !== 'string') return;
    if (
      nextStatus !== 'past_due' &&
      nextStatus !== 'active' &&
      nextStatus !== 'trialing' &&
      nextStatus !== 'canceled'
    ) {
      return;
    }

    const sub = await this.prisma.subscription.findUnique({
      where: { externalSubscriptionId: externalId },
    });
    if (!sub) return;

    const prevStatus = sub.status as SubscriptionStatus;
    if (prevStatus === nextStatus) return;
    await this.dunningSideEffectOnStatusChange({
      organizationId: sub.organizationId,
      prevStatus,
      nextStatus: nextStatus as SubscriptionStatus,
      reason: eventType,
    });
  }

  async markWebhookProcessed(input: { id: string; error?: string | null }): Promise<IWebhookEvent> {
    const updated = await this.prisma.webhookEvent.update({
      where: { id: input.id },
      data: {
        processedAt: input.error ? null : new Date(),
        processingError: input.error ?? null,
      },
    });
    return toEventRow(updated);
  }

  async getWebhookEventById(id: string): Promise<IWebhookEvent | null> {
    const row = await this.prisma.webhookEvent.findUnique({ where: { id } });
    return row ? toEventRow(row) : null;
  }
  // ─── Phase 5.2 — seat/plan changes wired through BillingProrationService ─────────

  /** Statuses that allow a mid-period seat/plan change. Anything past
   *  `past_due` is closed to avoid running proration math against a
   *  subscription that is about to be suspended. */
  private static readonly CHANGEABLE_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
    'active',
    'trialing',
  ]);

  private async loadSubscriptionForChange(
    organizationId: string
  ): Promise<ISubscription> {
    const row = await this.prisma.subscription.findUnique({ where: { organizationId } });
    if (!row) throw new NotFoundException(`subscription not found: ${organizationId}`);
    const sub = toSubRow(row);
    if (!BillingAuthService.CHANGEABLE_STATUSES.has(sub.status)) {
      throw new BadRequestException(
        `cannot change seats/plan while subscription is ${sub.status}`
      );
    }
    return sub;
  }

  /** Read-only preview for a seat-only change. Does not mutate state. */
  previewSeatChange(
    sub: ISubscription,
    deltaSeats: number,
    rate: IPlanRate,
    asOf?: Date
  ): IProrationPreview {
    const input: ISeatChangePreviewInput = {
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      ...(asOf ? { asOf } : {}),
      currentSeats: sub.seats,
      deltaSeats,
      rate,
    };
    return this.proration.previewSeatChange(input);
  }

  /**
   * Persists a seat change. Computes proration, updates the subscription
   * row, and creates a draft invoice for the proration amount. If
   * `idempotencyKey` is supplied and matches an existing draft invoice,
   * the change is treated as already-applied and the existing row is
   * returned.
   *
   * Returns `{ sub, invoice, preview }` so the controller can render
   * either a confirmation or a quota error without a second DB read.
   */
  async changeSeats(input: {
    organizationId: string;
    deltaSeats: number;
    rate: IPlanRate;
    idempotencyKey?: string;
    actor?: string;
    asOf?: Date;
  }): Promise<{ sub: ISubscription; invoice: IInvoice | null; preview: IProrationPreview }> {
    const sub = await this.loadSubscriptionForChange(input.organizationId);
    const preview = this.proration.previewSeatChange({
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      ...(input.asOf ? { asOf: input.asOf } : {}),
      currentSeats: sub.seats,
      deltaSeats: input.deltaSeats,
      rate: input.rate,
    });

    // Idempotency: if a draft invoice for this idempotency key already
    // exists, return the existing trio. We use `externalInvoiceId` as
    // the idempotency carrier (Stripe-shaped) so the same pattern works
    // for both internal & Stripe-driven changes.
    const externalInvoiceId = input.idempotencyKey
      ? `seat_change:${input.organizationId}:${input.idempotencyKey}`
      : `seat_change:${sub.id}:${Date.now().toString(36)}`;
    const existing = await this.prisma.invoice.findUnique({
      where: { externalInvoiceId },
    });
    if (existing) {
      const subRefreshed = await this.prisma.subscription.findUnique({
        where: { organizationId: input.organizationId },
      });
      return {
        sub: subRefreshed ? toSubRow(subRefreshed) : sub,
        invoice: toInvoiceRow(existing),
        preview,
      };
    }

    if (preview.noOp) {
      return { sub, invoice: null, preview };
    }

    const updated = await this.prisma.subscription.update({
      where: { organizationId: input.organizationId },
      data: { seats: sub.seats + input.deltaSeats },
    });

    let invoiceRow: Awaited<ReturnType<typeof this.prisma.invoice.create>> | null = null;
    if (preview.prorationCents !== 0) {
      const invoiceId = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      invoiceRow = await this.prisma.invoice.create({
        data: {
          id: invoiceId,
          subscriptionId: updated.id,
          externalInvoiceId,
          amountCents: Math.abs(preview.prorationCents),
          currency: preview.currency,
          status: 'draft',
          periodStart: sub.currentPeriodStart,
          periodEnd: sub.currentPeriodEnd,
          issuedAt: new Date(),
          paidAt: null,
        },
      });
    }

    return {
      sub: toSubRow(updated),
      invoice: invoiceRow ? toInvoiceRow(invoiceRow) : null,
      preview,
    };
  }

  /** Read-only preview for a plan change (with optional seat change). */
  previewPlanChange(
    sub: ISubscription,
    newSeats: number,
    newPlanCode: BillingPlanCode,
    rateCard: Partial<Record<BillingPlanCode, IPlanRate>>,
    asOf?: Date
  ): IProrationPreview {
    const input: IPlanChangePreviewInput = {
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      ...(asOf ? { asOf } : {}),
      currentSeats: sub.seats,
      newSeats,
      currentPlanCode: sub.planCode,
      newPlanCode,
      rateCard,
    };
    return this.proration.previewPlanChange(input);
  }

  /** Persists a plan change (with optional seat change). See `changeSeats`
   *  for idempotency + draft-invoice semantics. */
  async changePlan(input: {
    organizationId: string;
    newSeats: number;
    newPlanCode: BillingPlanCode;
    rateCard: Partial<Record<BillingPlanCode, IPlanRate>>;
    idempotencyKey?: string;
    actor?: string;
    asOf?: Date;
  }): Promise<{ sub: ISubscription; invoice: IInvoice | null; preview: IProrationPreview }> {
    const sub = await this.loadSubscriptionForChange(input.organizationId);
    const preview = this.proration.previewPlanChange({
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      ...(input.asOf ? { asOf: input.asOf } : {}),
      currentSeats: sub.seats,
      newSeats: input.newSeats,
      currentPlanCode: sub.planCode,
      newPlanCode: input.newPlanCode,
      rateCard: input.rateCard,
    });

    const externalInvoiceId = input.idempotencyKey
      ? `plan_change:${input.organizationId}:${input.idempotencyKey}`
      : `plan_change:${sub.id}:${Date.now().toString(36)}`;
    const existing = await this.prisma.invoice.findUnique({
      where: { externalInvoiceId },
    });
    if (existing) {
      const subRefreshed = await this.prisma.subscription.findUnique({
        where: { organizationId: input.organizationId },
      });
      return {
        sub: subRefreshed ? toSubRow(subRefreshed) : sub,
        invoice: toInvoiceRow(existing),
        preview,
      };
    }

    if (preview.noOp) {
      return { sub, invoice: null, preview };
    }

    const updated = await this.prisma.subscription.update({
      where: { organizationId: input.organizationId },
      data: { seats: input.newSeats, planCode: input.newPlanCode },
    });

    let invoiceRow: Awaited<ReturnType<typeof this.prisma.invoice.create>> | null = null;
    if (preview.prorationCents !== 0) {
      const invoiceId = `inv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      invoiceRow = await this.prisma.invoice.create({
        data: {
          id: invoiceId,
          subscriptionId: updated.id,
          externalInvoiceId,
          amountCents: Math.abs(preview.prorationCents),
          currency: preview.currency,
          status: 'draft',
          periodStart: sub.currentPeriodStart,
          periodEnd: sub.currentPeriodEnd,
          issuedAt: new Date(),
          paidAt: null,
        },
      });
    }

    return {
      sub: toSubRow(updated),
      invoice: invoiceRow ? toInvoiceRow(invoiceRow) : null,
      preview,
    };
  }
}


export { buildWebhookEventId };

function toSubRow(r: {
  id: string;
  organizationId: string;
  planCode: string;
  status: string;
  externalSubscriptionId: string;
  externalCustomerId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  seats: number;
  createdTime: Date;
  updatedTime: Date;
}): ISubscription {
  return {
    id: r.id,
    organizationId: r.organizationId,
    planCode: r.planCode as ISubscription['planCode'],
    status: r.status as ISubscription['status'],
    externalSubscriptionId: r.externalSubscriptionId,
    externalCustomerId: r.externalCustomerId,
    currentPeriodStart: r.currentPeriodStart,
    currentPeriodEnd: r.currentPeriodEnd,
    cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    canceledAt: r.canceledAt,
    seats: r.seats,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toInvoiceRow(r: {
  id: string;
  subscriptionId: string;
  externalInvoiceId: string;
  amountCents: number;
  currency: string;
  status: string;
  issuedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  paidAt: Date | null;
}): IInvoice {
  return {
    id: r.id,
    subscriptionId: r.subscriptionId,
    externalInvoiceId: r.externalInvoiceId,
    amountCents: r.amountCents,
    currency: r.currency,
    status: r.status as IInvoice['status'],
    issuedAt: r.issuedAt,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    paidAt: r.paidAt,
  };
}

function toEventRow(r: {
  id: string;
  externalEventId: string;
  eventType: string;
  receivedAt: Date;
  payloadJson: string;
  processedAt: Date | null;
  processingError: string | null;
}): IWebhookEvent {
  return {
    id: r.id,
    externalEventId: r.externalEventId,
    eventType: r.eventType,
    receivedAt: r.receivedAt,
    payloadJson: r.payloadJson,
    processedAt: r.processedAt,
    processingError: r.processingError,
  };
}
