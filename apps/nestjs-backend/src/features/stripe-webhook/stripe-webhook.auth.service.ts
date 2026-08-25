/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Stripe webhook reconciliation — NestJS auth service (Stage 83).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyReconciledEntries,
  capEntries,
  dedupeEvents,
  mapEventToAction,
  reconcileInvoice,
  summarizeEntries,
  validateSignature,
} from './stripe-webhook.service';
import type {
  IInternalBillableLine,
  IReconciliationEntry,
  IReconciliationSummary,
  IStripeEvent,
  IStripeInvoice,
  StripeEventKind,
} from './stripe-webhook.types';

@Injectable()
export class StripeWebhookAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate and ingest a Stripe webhook event. */
  async ingestEvent(input: {
    payload: string;
    event: IStripeEvent;
    secret: string;
    nowSeconds: number;
    now: string;
  }): Promise<IReconciliationSummary | null> {
    const sigOk = validateSignature({
      payload: input.payload,
      signature: input.event.signature,
      timestamp: input.event.signatureTimestamp,
      secret: input.secret,
      nowSeconds: input.nowSeconds,
    });
    if (!sigOk) throw new Error('invalid stripe webhook signature');
    const existing = await this.prisma.stripeWebhookEvent.findMany({
      where: { id: input.event.id },
    });
    const evs = existing.map((r) => this.rowToEvent(r));
    const deduped = dedupeEvents({ existing: evs, incoming: input.event });
    if (deduped.length === evs.length) {
      return null;
    }
    await this.prisma.stripeWebhookEvent.create({
      data: {
        id: input.event.id,
        kind: input.event.kind,
        createdAt: new Date(input.event.createdAt),
        invoiceId: input.event.invoice?.id,
        signature: input.event.signature,
        signatureTimestamp: input.event.signatureTimestamp,
      },
    });
    if (!input.event.invoice) {
      return summarizeEntries('none', []);
    }
    return this.reconcile({
      eventId: input.event.id,
      invoice: input.event.invoice,
      now: input.now,
    });
  }

  /** Reconcile internal billable lines against an invoice and persist entries. */
  async reconcile(input: {
    eventId: string;
    invoice: IStripeInvoice;
    now: string;
  }): Promise<IReconciliationSummary> {
    const internal = await this.prisma.internalBillableLine.findMany({
      where: { invoiceId: input.invoice.id },
    });
    const internalLines: IInternalBillableLine[] = internal.map((r) => ({
      id: String(r['id']),
      invoiceId: String(r['invoiceId']),
      lineItemId: String(r['lineItemId']),
      cents: Number(r['cents']),
    }));
    const action = mapEventToAction(
      input.invoice.status === 'paid' ? 'invoice.paid' : 'invoice.finalized'
    );
    const entries = reconcileInvoice({
      eventId: input.eventId,
      internalLines,
      invoice: input.invoice,
    });
    const updated = applyReconciledEntries({ entries, now: input.now, action });
    const capped = capEntries(updated);
    await this.prisma.stripeReconciliationEntry.deleteMany({
      where: { eventId: input.eventId },
    });
    for (const e of capped) {
      await this.prisma.stripeReconciliationEntry.create({
        data: {
          id: e.id,
          eventId: e.eventId,
          invoiceId: e.invoiceId,
          lineItemId: e.lineItemId,
          status: e.status,
          expectedCents: e.expectedCents,
          actualCents: e.actualCents,
          deltaCents: e.deltaCents,
          ...(e.appliedAt ? { appliedAt: new Date(e.appliedAt) } : {}),
          ...(e.reason ? { reason: e.reason } : {}),
        },
      });
    }
    return summarizeEntries(input.invoice.id, capped);
  }

  /** List entries still pending for an invoice. */
  async listUnmatched(invoiceId: string): Promise<IReconciliationEntry[]> {
    const rows = await this.prisma.stripeReconciliationEntry.findMany({
      where: { invoiceId, status: 'mismatch' },
    });
    return rows.map((r) => this.rowToEntry(r));
  }

  /** Read summary for an invoice. */
  async summaryFor(invoiceId: string): Promise<IReconciliationSummary> {
    const rows = await this.prisma.stripeReconciliationEntry.findMany({
      where: { invoiceId },
    });
    return summarizeEntries(
      invoiceId,
      rows.map((r) => this.rowToEntry(r))
    );
  }

  validateSignature = validateSignature;
  mapEventToAction = mapEventToAction;
  reconcileInvoice = reconcileInvoice;
  summarizeEntries = summarizeEntries;
  applyReconciledEntries = applyReconciledEntries;
  dedupeEvents = dedupeEvents;
  capEntries = capEntries;

  private rowToEvent(r: Record<string, unknown>): IStripeEvent {
    return {
      id: String(r['id']),
      kind: r['kind'] as StripeEventKind,
      createdAt: new Date(String(r['createdAt'])).toISOString(),
      signature: String(r['signature']),
      signatureTimestamp: Number(r['signatureTimestamp']),
    };
  }

  private rowToEntry(r: Record<string, unknown>): IReconciliationEntry {
    const out: IReconciliationEntry = {
      id: String(r['id']),
      eventId: String(r['eventId']),
      invoiceId: String(r['invoiceId']),
      lineItemId: String(r['lineItemId']),
      status: r['status'] as IReconciliationEntry['status'],
      expectedCents: Number(r['expectedCents']),
      actualCents: Number(r['actualCents']),
      deltaCents: Number(r['deltaCents']),
    };
    if (r['appliedAt']) out.appliedAt = new Date(String(r['appliedAt'])).toISOString();
    if (r['reason']) out.reason = String(r['reason']);
    return out;
  }
}
