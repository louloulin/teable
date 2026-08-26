/**
 * Webhook delivery — Stage 53.
 *
 * Pure helpers: payload signing, backoff math, dispatcher state
 * machine, dead-letter decision. The auth service persists deliveries
 * in Prisma and drives the dispatcher.
 */

import { createHmac } from 'node:crypto';

import type {
  IWebhookDelivery,
  IWebhookDispatcher,
  IWebhookEndpoint,
  IWebhookPayload,
  WebhookStatus,
} from './webhook-delivery.types';
import {
  DEFAULT_BASE_BACKOFF_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_BACKOFF_MS,
  DEFAULT_TIMEOUT_MS,
  MAX_BACKOFF_MULTIPLIER,
} from './webhook-delivery.types';

export function isWebhookStatus(s: string): s is WebhookStatus {
  return (
    s === 'pending' || s === 'in_flight' || s === 'delivered' || s === 'failed' || s === 'dead'
  );
}

export function isTerminalStatus(s: WebhookStatus): boolean {
  return s === 'delivered' || s === 'dead';
}

/** Compute the backoff (ms) for the next attempt. Exponential w/ cap + jitter. */
export function computeBackoff(args: {
  attempt: number;
  baseMs?: number;
  maxMs?: number;
  /** Optional override for jitter / deterministic testing. */
  random?: () => number;
}): number {
  const base = args.baseMs ?? DEFAULT_BASE_BACKOFF_MS;
  const max = args.maxMs ?? DEFAULT_MAX_BACKOFF_MS;
  const r = args.random ?? Math.random;
  const expo = Math.min(args.attempt, MAX_BACKOFF_MULTIPLIER);
  const expWindow = base * 2 ** expo;
  const capped = Math.min(max, expWindow);
  const jitter = r();
  return Math.floor(capped * (0.5 + jitter * 0.5));
}

/** Sign a webhook body with HMAC-SHA256 using the endpoint's secret. */
export function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

/** Build the standard headers, injecting signature + idempotency key. */
export function buildRequestHeaders(args: {
  body: string;
  secret: string;
  deliveryId: string;
  event: string;
  contentType?: string;
  extra?: Record<string, string>;
}): Record<string, string> {
  const sig = signBody(args.body, args.secret);
  const headers: Record<string, string> = {
    /* eslint-disable @typescript-eslint/naming-convention */
    'Content-Type': args.contentType ?? 'application/json',
    'X-Teable-Signature': `sha256=${sig}`,
    'X-Teable-Delivery': args.deliveryId,
    'X-Teable-Event': args.event,
    'User-Agent': 'Teable-Webhooks/1.0',
    /* eslint-enable @typescript-eslint/naming-convention */
  };
  for (const [k, v] of Object.entries(args.extra ?? {})) {
    if (typeof v === 'string') headers[k] = v;
  }
  return headers;
}

export function isValidUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function endpointAcceptsEvent(ep: IWebhookEndpoint, event: string): boolean {
  if (ep.events.length === 0) return true;
  return ep.events.includes(event);
}

export function decideNextStatus(args: {
  attempt: number;
  maxAttempts: number;
  httpOk: boolean;
  retriable: boolean;
}): WebhookStatus {
  if (args.httpOk) return 'delivered';
  const isLast = args.attempt >= args.maxAttempts;
  if (isLast || !args.retriable) return 'dead';
  return 'pending';
}

/**
 * Apply one attempt to a delivery: returns the next state.
 * The caller is responsible for persisting the result.
 */
export async function advanceDelivery(args: {
  delivery: IWebhookDelivery;
  endpoint: IWebhookEndpoint;
  payload: IWebhookPayload;
  dispatcher: IWebhookDispatcher;
  now?: Date;
  timeoutMs?: number;
}): Promise<{
  next: IWebhookDelivery;
  result: { statusCode: number; body: string };
}> {
  const attemptNo = args.delivery.attempt + 1;
  const startedAt = args.now ?? new Date();
  const headers = buildRequestHeaders({
    body: args.payload.body,
    secret: args.endpoint.secret,
    deliveryId: args.delivery.id,
    event: args.payload.event,
    extra: args.endpoint.headers,
  });
  const out = await args.dispatcher.send({
    method: 'POST',
    url: args.endpoint.url,
    body: args.payload.body,
    secret: args.endpoint.secret,
    headers,
    timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });
  const httpOk = out.statusCode >= 200 && out.statusCode < 300;
  const retriable =
    out.statusCode === 0 ||
    out.statusCode === 408 ||
    out.statusCode === 429 ||
    out.statusCode >= 500;
  const nextStatus = decideNextStatus({
    attempt: attemptNo,
    maxAttempts: args.delivery.maxAttempts,
    httpOk,
    retriable,
  });
  const isLast = nextStatus === 'dead' || nextStatus === 'delivered';
  const next: IWebhookDelivery = {
    ...args.delivery,
    status: nextStatus,
    attempt: attemptNo,
    lastStatusCode: out.statusCode,
    lastAttemptAt: startedAt,
    deliveredAt: httpOk ? startedAt : args.delivery.deliveredAt,
    finalizedAt: isLast ? startedAt : args.delivery.finalizedAt,
    nextAttemptAt: isLast
      ? startedAt
      : new Date(startedAt.getTime() + computeBackoff({ attempt: attemptNo })),
  };
  return { next, result: out };
}

/** Build a Prisma row from a domain delivery. */
export function toRow(d: IWebhookDelivery): {
  id: string;
  endpointId: string;
  payloadId: string;
  status: WebhookStatus;
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lastStatusCode: number | null;
  lastError: string | null;
  lastAttemptAt: Date | null;
  finalizedAt: Date | null;
  deliveredAt: Date | null;
  createdTime: Date;
} {
  return {
    id: d.id,
    endpointId: d.endpointId,
    payloadId: d.payloadId,
    status: d.status,
    attempt: d.attempt,
    maxAttempts: d.maxAttempts,
    nextAttemptAt: d.nextAttemptAt,
    lastStatusCode: d.lastStatusCode ?? null,
    lastError: d.lastError ?? null,
    lastAttemptAt: d.lastAttemptAt ?? null,
    finalizedAt: d.finalizedAt ?? null,
    deliveredAt: d.deliveredAt ?? null,
    createdTime: d.createdTime,
  };
}

/** Pick deliveries that are eligible to dispatch right now. */
export function pickDueDeliveries(
  deliveries: ReadonlyArray<IWebhookDelivery>,
  now: Date = new Date()
): IWebhookDelivery[] {
  return deliveries.filter(
    (d) =>
      (d.status === 'pending' || d.status === 'failed') &&
      d.nextAttemptAt.getTime() <= now.getTime()
  );
}

export function newDeliveryId(): string {
  return `dlv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function buildPayload(args: { event: string; body: string }): IWebhookPayload {
  return {
    id: `pld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    event: args.event,
    body: args.body,
    createdTime: new Date(),
  };
}

export { DEFAULT_MAX_ATTEMPTS };
