/**
 * Billing — Stage 32.
 *
 * Pure helpers + Stripe-style webhook signing.
 * Stripe uses `t=<unix>,v1=<hex>` signatures; we verify that the
 * HMAC of `<t>.<payload>` under the configured secret matches.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

import type {
  BillingEventHandler,
  BillingPlanCode,
  ICreateInvoiceInput,
  ICreateSubscriptionInput,
  IInvoice,
  IPlanDescriptor,
  ISubscription,
  IUpdateSubscriptionInput,
  InvoiceStatus,
  IWebhookEvent,
  SubscriptionStatus,
} from './billing.types';
import { PLAN_TABLE } from './billing.types';

const SIG_HEADER_REGEX = /^t=(\d+),v1=([a-f0-9]+)(?:,v0=([a-f0-9]+))?$/;
const MAX_TIMESTAMP_DRIFT_SECONDS = 5 * 60;

/** Build the Stripe-style `t=<unix>,v1=<hex>` signature header. */
export function signWebhook(input: { secret: string; payload: string; timestamp: number }): string {
  const signedPayload = `${input.timestamp}.${input.payload}`;
  const v1 = createHmac('sha256', input.secret).update(signedPayload).digest('hex');
  return `t=${input.timestamp},v1=${v1}`;
}

export function verifyWebhookSignature(input: {
  header: string | null | undefined;
  secret: string;
  payload: string;
  /** Override the drift tolerance for tests; defaults to 5 minutes. */
  maxDriftSeconds?: number;
  now?: number;
}): {
  valid: boolean;
  reason: 'missing' | 'malformed' | 'too-old' | 'mismatch' | null;
  timestamp?: number;
} {
  if (!input.header) return { valid: false, reason: 'missing', timestamp: undefined };
  const m = SIG_HEADER_REGEX.exec(input.header);
  if (!m) return { valid: false, reason: 'malformed', timestamp: undefined };
  const t = Number.parseInt(m[1], 10);
  const v1 = m[2];
  const now = input.now ?? Math.floor(Date.now() / 1000);
  const drift = input.maxDriftSeconds ?? MAX_TIMESTAMP_DRIFT_SECONDS;
  if (Math.abs(now - t) > drift) return { valid: false, reason: 'too-old', timestamp: t };
  const expected = createHmac('sha256', input.secret).update(`${t}.${input.payload}`).digest('hex');
  if (expected.length !== v1.length) return { valid: false, reason: 'mismatch', timestamp: t };
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  if (diff !== 0) return { valid: false, reason: 'mismatch', timestamp: t };
  return { valid: true, reason: null, timestamp: t };
}

export function parseEventPayload(rawJson: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(rawJson);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fallthrough
  }
  return null;
}

/** Map plan code → descriptor; falls back to free. */
export function resolvePlan(code: string): IPlanDescriptor | null {
  return PLAN_TABLE.find((p) => p.code === code) ?? null;
}

/** Compute the seat price in cents given a plan + seat count. */
export function computePlanAmount(input: {
  planCode: BillingPlanCode;
  seats: number;
  perSeatAddOnCents?: number;
}): number {
  const plan = resolvePlan(input.planCode);
  if (!plan) return 0;
  const base = plan.monthlyCents;
  const addon = input.perSeatAddOnCents ?? 0;
  return base + Math.max(0, input.seats - 1) * addon;
}

/** Decide whether a subscription can serve a new seat request. */
export function canAddSeats(input: { sub: ISubscription; requestedSeats: number }): boolean {
  const plan = resolvePlan(input.sub.planCode);
  if (!plan) return false;
  if (plan.seatLimit === null) return true;
  return input.requestedSeats <= plan.seatLimit;
}

/** Stripe-style status transitions. */
export function isValidSubscriptionTransition(
  from: SubscriptionStatus,
  to: SubscriptionStatus
): boolean {
  const allow: Record<SubscriptionStatus, ReadonlyArray<SubscriptionStatus>> = {
    incomplete: ['active', 'canceled', 'past_due'],
    active: ['past_due', 'canceled', 'unpaid', 'trialing'],
    past_due: ['active', 'canceled', 'unpaid'],
    canceled: [],
    unpaid: ['canceled', 'active'],
    trialing: ['active', 'past_due', 'canceled'],
  };
  return allow[from]?.includes(to) ?? false;
}

export function isInvoiceTerminal(status: InvoiceStatus): boolean {
  return status === 'paid' || status === 'void' || status === 'uncollectible';
}

export function isValidInvoiceTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  const allow: Record<InvoiceStatus, ReadonlyArray<InvoiceStatus>> = {
    draft: ['open', 'void'],
    open: ['paid', 'void', 'uncollectible'],
    paid: [],
    void: [],
    uncollectible: ['paid', 'void'],
  };
  return allow[from]?.includes(to) ?? false;
}

export function buildSubscriptionRow(
  input: ICreateSubscriptionInput & { id: string; now?: Date }
): ISubscription {
  return {
    id: input.id,
    organizationId: input.organizationId,
    planCode: input.planCode,
    status: 'incomplete',
    externalSubscriptionId: input.externalSubscriptionId,
    externalCustomerId: input.externalCustomerId,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    seats: input.seats ?? 1,
    createdTime: input.now ?? new Date(),
    updatedTime: input.now ?? new Date(),
  };
}

export function applySubscriptionUpdate(
  row: ISubscription,
  update: IUpdateSubscriptionInput
): ISubscription {
  return {
    ...row,
    planCode: update.planCode ?? row.planCode,
    status: update.status ?? row.status,
    currentPeriodStart: update.currentPeriodStart ?? row.currentPeriodStart,
    currentPeriodEnd: update.currentPeriodEnd ?? row.currentPeriodEnd,
    cancelAtPeriodEnd: update.cancelAtPeriodEnd ?? row.cancelAtPeriodEnd,
    canceledAt: update.canceledAt !== undefined ? update.canceledAt : row.canceledAt,
    seats: update.seats ?? row.seats,
    updatedTime: new Date(),
  };
}

export function buildInvoiceRow(input: ICreateInvoiceInput & { id: string; now?: Date }): IInvoice {
  return {
    id: input.id,
    subscriptionId: input.subscriptionId,
    externalInvoiceId: input.externalInvoiceId,
    amountCents: input.amountCents,
    currency: input.currency ?? 'usd',
    status: input.status ?? 'open',
    issuedAt: input.now ?? new Date(),
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    paidAt: null,
  };
}

/** Decide which Stripe events we care about. */
export const HANDLED_EVENT_TYPES: ReadonlyArray<string> = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
];

export function isHandledEvent(eventType: string): boolean {
  return HANDLED_EVENT_TYPES.includes(eventType);
}

/** Build an idempotency-safe event id from the external id + namespace. */
export function buildWebhookEventId(externalEventId: string): string {
  return `webh_${createHmac('sha256', 'webhook-namespace').update(externalEventId).digest('hex').slice(0, 24)}`;
}

/** Dispatch table helpers — kept here so the auth service can plug in handlers. */
export const DEFAULT_EVENT_DISPATCH: Record<string, BillingEventHandler> = {};
