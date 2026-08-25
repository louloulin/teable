/* eslint-disable @typescript-eslint/naming-convention */
/**
 * SCIM Push provisioning — pure helpers (Stage 67).
 */

import { createHmac } from 'node:crypto';

import type {
  IScimPushDelivery,
  IScimPushDeliveryAttempt,
  IScimPushEvent,
  IScimPushOptions,
  IScimPushOutcome,
  IScimPushSubscription,
  ScimPushDeliveryStatus,
  ScimPushEventKind,
} from './scim-push.types';
import {
  DEFAULT_BASE_BACKOFF_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_BACKOFF_MS,
  MAX_FILTER_KINDS,
  MAX_SUBSCRIPTIONS_PER_ORG,
} from './scim-push.types';

const ALL_KINDS: ReadonlyArray<ScimPushEventKind> = [
  'user.created',
  'user.updated',
  'user.deactivated',
  'user.deleted',
  'group.created',
  'group.updated',
  'group.deleted',
  'group.members.added',
  'group.members.removed',
];

export const SCIM_PUSH_ALL_KINDS: ReadonlyArray<ScimPushEventKind> = ALL_KINDS;

function isKind(s: string): s is ScimPushEventKind {
  return (ALL_KINDS as ReadonlyArray<string>).includes(s);
}

function isStatus(s: string): s is ScimPushDeliveryStatus {
  return (
    s === 'pending' ||
    s === 'in-flight' ||
    s === 'delivered' ||
    s === 'failed' ||
    s === 'dead-letter' ||
    s === 'skipped'
  );
}

/** Validate a subscription record. */
export function validateSubscription(sub: IScimPushSubscription): string[] {
  const errs: string[] = [];
  if (!sub.id) errs.push('id is required');
  if (!sub.orgId) errs.push('orgId is required');
  if (!sub.label) errs.push('label is required');
  if (!isHttpsUrl(sub.endpoint)) errs.push('endpoint must be a valid https URL');
  if (!sub.signingSecret || sub.signingSecret.length < 16) {
    errs.push('signingSecret must be at least 16 chars');
  }
  if (sub.filter.length > MAX_FILTER_KINDS) {
    errs.push(`too many filter kinds (${sub.filter.length} > ${MAX_FILTER_KINDS})`);
  }
  for (const k of sub.filter) if (!isKind(k)) errs.push(`unknown event kind: ${k}`);
  return errs;
}

function isHttpsUrl(s: string): boolean {
  return /^https:\/\/[^\s/$.?#].\S*$/i.test(s);
}

/** Normalize a subscription (drop unknown kinds, ensure timestamps). */
export function normalizeSubscription(
  input: Partial<IScimPushSubscription> & {
    id: string;
    orgId: string;
    endpoint: string;
    signingSecret: string;
  }
): IScimPushSubscription {
  const now = new Date().toISOString();
  return {
    id: input.id,
    orgId: input.orgId,
    label: input.label ?? '',
    endpoint: input.endpoint,
    signingSecret: input.signingSecret,
    filter: (input.filter ?? []).filter(isKind),
    enabled: input.enabled ?? true,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

/** Whether the org can register another subscription. */
export function canRegisterMore(currentCount: number): boolean {
  return currentCount < MAX_SUBSCRIPTIONS_PER_ORG;
}

/** Decide whether this event passes the subscription filter. */
export function shouldDeliver(sub: IScimPushSubscription, kind: ScimPushEventKind): boolean {
  if (!sub.enabled) return false;
  if (sub.filter.length === 0) return true;
  return sub.filter.includes(kind);
}

/** Build the HMAC signature header value (`sha256=<hex>`). */
export function signPayload(secret: string, payload: string): string {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

/** Build the canonical HTTP request envelope for one event. */
export function buildRequest(input: {
  subscription: IScimPushSubscription;
  event: IScimPushEvent;
}): { url: string; body: string; signature: string; headers: Record<string, string> } {
  const body = JSON.stringify({
    id: input.event.id,
    kind: input.event.kind,
    subjectId: input.event.subjectId,
    externalId: input.event.externalId,
    occurredAt: input.event.occurredAt,
    payload: input.event.payload,
  });
  const signature = signPayload(input.subscription.signingSecret, body);
  return {
    url: input.subscription.endpoint,
    body,
    signature,
    headers: {
      'content-type': 'application/scim+json',
      'x-scim-push-signature': signature,
      'x-scim-push-event-id': input.event.id,
    },
  };
}

/** Pure: should we retry, and when? */
export function computeBackoff(input: {
  attemptsSoFar: number;
  lastStatusCode: number | null;
  options?: IScimPushOptions;
}): { retry: boolean; delayMs: number; nextStatus: ScimPushDeliveryStatus } {
  const max = input.options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const base = input.options?.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const cap = input.options?.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;
  if (input.attemptsSoFar >= max) {
    return { retry: false, delayMs: 0, nextStatus: 'dead-letter' };
  }
  if (input.lastStatusCode !== null && isRetryableStatus(input.lastStatusCode)) {
    const delay = Math.min(cap, base * 2 ** input.attemptsSoFar);
    return { retry: true, delayMs: delay, nextStatus: 'failed' };
  }
  if (input.lastStatusCode !== null && !isRetryableStatus(input.lastStatusCode)) {
    return { retry: false, delayMs: 0, nextStatus: 'dead-letter' };
  }
  return { retry: true, delayMs: base, nextStatus: 'pending' };
}

function isRetryableStatus(code: number): boolean {
  if (code >= 500 && code < 600) return true;
  if (code === 408 || code === 425 || code === 429) return true;
  return false;
}

/** Record one delivery attempt and produce the updated state. */
export function recordAttempt(input: {
  delivery: IScimPushDelivery;
  attempt: IScimPushDeliveryAttempt;
  options?: IScimPushOptions;
  now?: Date;
}): { delivery: IScimPushDelivery; outcome: IScimPushOutcome } {
  const now = (input.now ?? new Date()).toISOString();
  const nextAttempts = input.delivery.attempts + 1;
  const backoff = computeBackoff({
    attemptsSoFar: nextAttempts,
    lastStatusCode: input.attempt.statusCode,
    ...(input.options ? { options: input.options } : {}),
  });
  const status =
    input.attempt.statusCode !== null
      ? backoff.nextStatus
      : backoff.retry
        ? 'failed'
        : 'dead-letter';
  const next: IScimPushDelivery = {
    ...input.delivery,
    attempts: nextAttempts,
    status,
    lastAttemptAt: input.attempt.attemptedAt,
    lastStatusCode: input.attempt.statusCode,
    lastError: input.attempt.error,
    nextRetryAt: backoff.retry
      ? new Date(new Date(now).getTime() + backoff.delayMs).toISOString()
      : null,
    updatedAt: now,
  };
  const outcome: IScimPushOutcome = {
    deliveryId: next.id,
    status,
    attempts: nextAttempts,
    deadLettered: status === 'dead-letter',
  };
  return { delivery: next, outcome };
}

/** Whether a delivery is terminal. */
export function isTerminal(status: ScimPushDeliveryStatus): boolean {
  return status === 'delivered' || status === 'dead-letter' || status === 'skipped';
}

export const testHelpers = { isKind, isStatus, isHttpsUrl, isRetryableStatus };
