/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Stripe webhook reconciliation — NestJS auth service (Stage 83).
 *
 * Unifies the webhook processing pipeline with the same durable-task
 * protocol used by AI Chat long task and AI Field batch generation:
 *
 *   queued → processing → succeeded | failed
 *
 * The event id (`StripeWebhookEvent.id`) is treated as an
 * `idempotencyKey`. Replays of the same event land on the existing row
 * and are short-circuited unless the prior attempt's lease has
 * expired (recovery).
 */

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
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
export class StripeWebhookAuthService implements OnModuleInit {
  private readonly logger = new Logger(StripeWebhookAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const recovered = await this.recoverExpiredEvents();
    if (recovered > 0) {
      this.logger.log(`Recovered ${recovered} expired Stripe webhook leases on startup`);
    }
  }

  /** Default lease window (5 min) — exceeded if the worker crashes mid-reconciliation. */
  private static readonly LEASE_MS = 5 * 60 * 1000;

  /** Validate and ingest a Stripe webhook event.
   *
   * The event id is used as the idempotency key. Replays land on the
   * existing row and return `null` (deduped). A stale `processing`
   * row (lease expired) is reclaimed for retry, up to `maxAttempts`.
   */
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

    const now = new Date(input.now);
    const leaseUntil = new Date(now.getTime() + StripeWebhookAuthService.LEASE_MS);

    // Atomic claim: insert with status='queued'; on conflict the existing
    // row determines whether we dedupe (terminal), wait (in-flight), or
    // reclaim (lease expired).
    const created = await this.prisma.stripeWebhookEvent
      .create({
        data: {
          id: input.event.id,
          kind: input.event.kind,
          createdAt: new Date(input.event.createdAt),
          invoiceId: input.event.invoice?.id,
          signature: input.event.signature,
          signatureTimestamp: input.event.signatureTimestamp,
          status: 'queued',
          attempt: 0,
          maxAttempts: 5,
          processedAt: null,
        },
      })
      .then(
        () => 'created' as const,
        (error: { code?: string }) =>
          error?.code === 'P2002' ? ('conflict' as const) : Promise.reject(error)
      );
    if (created === 'conflict') {
      const existing = await this.prisma.stripeWebhookEvent.findUnique({
        where: { id: input.event.id },
      });
      if (!existing) return null;
      const status = String(existing.status ?? 'queued');
      const leaseExpired =
        status === 'processing' &&
        existing.leaseUntil instanceof Date &&
        existing.leaseUntil.getTime() < now.getTime();
      const canRetry =
        status === 'failed' &&
        (existing.attempt ?? 0) < (existing.maxAttempts ?? 5) &&
        (existing.retryAt == null || existing.retryAt.getTime() <= now.getTime());
      if (status === 'succeeded') {
        // Idempotent terminal state — replays return deduped.
        return null;
      }
      if (status === 'processing' && !leaseExpired) {
        // Another worker is still running; don't double-process.
        return null;
      }
      if (!leaseExpired && !canRetry) {
        return null;
      }
      const claimed = await this.prisma.stripeWebhookEvent.updateMany({
        where: {
          id: input.event.id,
          OR: [
            leaseExpired
              ? { status: 'processing', leaseUntil: { lt: now } }
              : { status: 'failed' },
            { status: 'queued' },
          ],
        },
        data: {
          status: 'processing',
          heartbeatAt: now,
          leaseUntil,
          lastError: null,
          errorCode: null,
          attempt: { increment: 1 },
        },
      });
      if (claimed.count === 0) return null;
    } else {
      // Newly created row — move to processing immediately.
      const claimed = await this.prisma.stripeWebhookEvent.updateMany({
        where: { id: input.event.id, status: 'queued' },
        data: {
          status: 'processing',
          heartbeatAt: now,
          leaseUntil,
          attempt: { increment: 1 },
        },
      });
      if (claimed.count === 0) return null;
    }

    try {
      const summary = input.event.invoice
        ? await this.reconcile({
            eventId: input.event.id,
            invoice: input.event.invoice,
            now: input.now,
          })
        : summarizeEntries('none', []);
      await this.prisma.stripeWebhookEvent.updateMany({
        where: { id: input.event.id },
        data: {
          status: 'succeeded',
          heartbeatAt: new Date(),
          leaseUntil: null,
          retryAt: null,
          processedAt: new Date(),
          lastError: null,
          errorCode: null,
        },
      });
      return summary;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const fresh = await this.prisma.stripeWebhookEvent.findUnique({
        where: { id: input.event.id },
      });
      const attempt = fresh?.attempt ?? 1;
      const maxAttempts = fresh?.maxAttempts ?? 5;
      const retryable = attempt < maxAttempts;
      const retryAt = retryable
        ? new Date(now.getTime() + this.retryDelayMs(attempt))
        : null;
      await this.prisma.stripeWebhookEvent.updateMany({
        where: { id: input.event.id },
        data: {
          status: retryable ? 'queued' : 'failed',
          heartbeatAt: new Date(),
          leaseUntil: null,
          retryAt,
          processedAt: retryable ? null : new Date(),
          lastError: message.slice(0, 2000),
          errorCode: retryable ? 'TRANSIENT_PROCESSING_ERROR' : 'PROCESSING_FAILED',
        },
      });
      if (retryable) throw error;
      return summarizeEntries('none', []);
    }
  }

  /** Recover webhook events left in `processing` whose lease has expired. */
  async recoverExpiredEvents(): Promise<number> {
    const now = new Date();
    const recovered = await this.prisma.stripeWebhookEvent.updateMany({
      where: { status: 'processing', leaseUntil: { lt: now } },
      data: { status: 'queued', leaseUntil: null, retryAt: now, heartbeatAt: null },
    });
    return recovered.count;
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
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
