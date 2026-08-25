/**
 * Stripe webhook reconciliation — types (Stage 83).
 */

export const STRIPE_EVENT_KINDS = [
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.finalized',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.refunded',
  'payment_intent.succeeded',
] as const;
export type StripeEventKind = (typeof STRIPE_EVENT_KINDS)[number];

export const RECONCILIATION_STATUSES = ['pending', 'matched', 'mismatch', 'applied'] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

/** Sub-cent tolerance (Stripe rounds half-even). */
export const RECONCILIATION_TOLERANCE_CENTS = 1;

/** Max age (seconds) a webhook signature timestamp may be off from server clock. */
export const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300;

/** Cap on stored reconciliation entries per org. */
export const MAX_RECONCILIATION_ENTRIES = 4096;

export interface IStripeLineItem {
  id: string;
  description: string;
  amountCents: number;
  quantity: number;
  periodStart: string;
  periodEnd: string;
}

export interface IStripeInvoice {
  id: string;
  customerId: string;
  subscriptionId?: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  totalCents: number;
  lineItems: IStripeLineItem[];
  createdAt: string;
}

export interface IStripeEvent {
  id: string;
  kind: StripeEventKind;
  createdAt: string;
  invoice?: IStripeInvoice;
  signature: string;
  signatureTimestamp: number;
}

export interface IReconciliationEntry {
  id: string;
  eventId: string;
  invoiceId: string;
  lineItemId: string;
  status: ReconciliationStatus;
  expectedCents: number;
  actualCents: number;
  deltaCents: number;
  appliedAt?: string;
  reason?: string;
}

export interface IReconciliationSummary {
  invoiceId: string;
  matched: number;
  mismatched: number;
  pending: number;
  applied: number;
  totalDeltaCents: number;
}

export interface IInternalBillableLine {
  id: string;
  invoiceId: string;
  lineItemId: string;
  cents: number;
}

export type ReconciliationAction = 'apply' | 'reverse' | 'noop';
