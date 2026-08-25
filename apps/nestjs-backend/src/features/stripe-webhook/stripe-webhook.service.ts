/**
 * Stripe webhook reconciliation — pure helpers (Stage 83).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  IInternalBillableLine,
  IReconciliationEntry,
  IReconciliationSummary,
  IStripeEvent,
  IStripeInvoice,
  IStripeLineItem,
  ReconciliationAction,
  StripeEventKind,
} from './stripe-webhook.types';
import {
  MAX_RECONCILIATION_ENTRIES,
  RECONCILIATION_TOLERANCE_CENTS,
  STRIPE_EVENT_KINDS,
  STRIPE_WEBHOOK_TOLERANCE_SECONDS,
} from './stripe-webhook.types';

/** Type guard for Stripe event kinds. */
export function isStripeEventKind(s: string): s is StripeEventKind {
  return (STRIPE_EVENT_KINDS as ReadonlyArray<string>).includes(s);
}

/** Validate an HMAC-SHA256 signature with timestamp tolerance (seconds). */
export function validateSignature(input: {
  payload: string;
  signature: string;
  timestamp: number;
  secret: string;
  nowSeconds: number;
}): boolean {
  if (!input.payload || !input.signature || !input.secret) return false;
  if (Math.abs(input.nowSeconds - input.timestamp) > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
    return false;
  }
  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestamp}.${input.payload}`)
    .digest('hex');
  if (expected.length !== input.signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(input.signature));
  } catch {
    return false;
  }
}

/** Map an event kind to a billing action. */
export function mapEventToAction(kind: StripeEventKind): ReconciliationAction {
  if (kind === 'invoice.paid' || kind === 'payment_intent.succeeded') return 'apply';
  if (kind === 'invoice.payment_failed' || kind === 'charge.refunded') return 'reverse';
  if (kind === 'invoice.finalized') return 'noop';
  return 'noop';
}

/** Compute delta cents between expected internal line and actual Stripe line. */
export function matchLineItem(input: { expectedCents: number; actualCents: number }): {
  matched: boolean;
  deltaCents: number;
} {
  const delta = input.actualCents - input.expectedCents;
  return { matched: Math.abs(delta) <= RECONCILIATION_TOLERANCE_CENTS, deltaCents: delta };
}

/** Reconcile internal billable lines against a Stripe invoice. */
export function reconcileInvoice(input: {
  eventId: string;
  internalLines: IInternalBillableLine[];
  invoice: IStripeInvoice;
}): IReconciliationEntry[] {
  const out: IReconciliationEntry[] = [];
  const stripeByLine = new Map<string, IStripeLineItem>();
  for (const li of input.invoice.lineItems) stripeByLine.set(li.id, li);
  for (const il of input.internalLines) {
    const stripeLine = stripeByLine.get(il.lineItemId);
    const actual = stripeLine ? stripeLine.amountCents : 0;
    const match = matchLineItem({
      expectedCents: il.cents,
      actualCents: actual,
    });
    const entry: IReconciliationEntry = {
      id: `${input.eventId}:${il.lineItemId}`,
      eventId: input.eventId,
      invoiceId: input.invoice.id,
      lineItemId: il.lineItemId,
      status: match.matched ? 'matched' : 'mismatch',
      expectedCents: il.cents,
      actualCents: actual,
      deltaCents: match.deltaCents,
    };
    if (!stripeLine) entry.reason = 'no matching stripe line';
    out.push(entry);
  }
  for (const stripeLine of input.invoice.lineItems) {
    const found = input.internalLines.find((l) => l.lineItemId === stripeLine.id);
    if (!found) {
      out.push({
        id: `${input.eventId}:${stripeLine.id}`,
        eventId: input.eventId,
        invoiceId: input.invoice.id,
        lineItemId: stripeLine.id,
        status: 'mismatch',
        expectedCents: 0,
        actualCents: stripeLine.amountCents,
        deltaCents: stripeLine.amountCents,
        reason: 'no matching internal line',
      });
    }
  }
  return out;
}

/** Summarize a list of reconciliation entries by status. */
export function summarizeEntries(
  invoiceId: string,
  entries: IReconciliationEntry[]
): IReconciliationSummary {
  let matched = 0;
  let mismatched = 0;
  let pending = 0;
  let applied = 0;
  let totalDelta = 0;
  for (const e of entries) {
    if (e.status === 'matched') matched++;
    else if (e.status === 'mismatch') mismatched++;
    else if (e.status === 'applied') applied++;
    else pending++;
    totalDelta += e.deltaCents;
  }
  return {
    invoiceId,
    matched,
    mismatched,
    pending,
    applied,
    totalDeltaCents: totalDelta,
  };
}

/** Mark all matched entries as applied. Returns updated entries. */
export function applyReconciledEntries(input: {
  entries: IReconciliationEntry[];
  now: string;
  action: ReconciliationAction;
}): IReconciliationEntry[] {
  return input.entries.map((e) => {
    if (e.status === 'matched' && input.action === 'apply') {
      const next: IReconciliationEntry = {
        ...e,
        status: 'applied',
        appliedAt: input.now,
      };
      return next;
    }
    if (e.status === 'applied' && input.action === 'reverse') {
      const next: IReconciliationEntry = { ...e, status: 'pending' };
      delete next.appliedAt;
      return next;
    }
    return e;
  });
}

/** Dedupe events by id — keep first occurrence. */
export function dedupeEvents(input: {
  existing: IStripeEvent[];
  incoming: IStripeEvent;
}): IStripeEvent[] {
  if (input.existing.some((e) => e.id === input.incoming.id)) return input.existing;
  return [...input.existing, input.incoming];
}

/** Cap entries to MAX_RECONCILIATION_ENTRIES. */
export function capEntries(entries: IReconciliationEntry[]): IReconciliationEntry[] {
  if (entries.length <= MAX_RECONCILIATION_ENTRIES) return entries;
  return entries.slice(entries.length - MAX_RECONCILIATION_ENTRIES);
}
