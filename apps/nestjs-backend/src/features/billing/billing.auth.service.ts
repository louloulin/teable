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
import type {
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
  constructor(private readonly prisma: PrismaService) {}

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
    return toSubRow(updated);
  }

  async cancelSubscription(organizationId: string, atPeriodEnd: boolean): Promise<ISubscription> {
    return this.updateSubscription(organizationId, {
      status: 'canceled',
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
    return { event: toEventRow(created), alreadyProcessed: false, payload };
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
