/* eslint-disable @typescript-eslint/naming-convention */
/**
 * SCIM Push provisioning — Stage 67.
 *
 * The push side of SCIM 2.0 (RFC 7644). Stage 23 owns the pull side
 * (IdP → Teable); this module owns the events Teable sends to the
 * IdP when membership, role assignment, or deprovisioning changes
 * happen out-of-band (admin panel, automation, manual SCIM write).
 *
 * The push delivers an outbound webhook per resource with HMAC
 * signature, retry/back-off, dead-letter on terminal failure, and
 * a per-org delivery ledger so the admin can replay / inspect.
 */

export type ScimPushEventKind =
  | 'user.created'
  | 'user.updated'
  | 'user.deactivated'
  | 'user.deleted'
  | 'group.created'
  | 'group.updated'
  | 'group.deleted'
  | 'group.members.added'
  | 'group.members.removed';

export type ScimPushDeliveryStatus =
  | 'pending'
  | 'in-flight'
  | 'delivered'
  | 'failed'
  | 'dead-letter'
  | 'skipped';

export interface IScimPushSubscription {
  id: string;
  orgId: string;
  /** Human-readable label shown in the admin panel. */
  label: string;
  /** HTTPS endpoint that accepts the push payload. */
  endpoint: string;
  /** HMAC secret shared with the IdP. */
  signingSecret: string;
  /** Event kinds to forward; empty = forward all. */
  filter: ScimPushEventKind[];
  /** When false, deliveries are still persisted but not sent. */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IScimPushEvent {
  id: string;
  orgId: string;
  subscriptionId: string;
  kind: ScimPushEventKind;
  /** Stable subject id (user or group). */
  subjectId: string;
  /** IdP-side externalId when known. */
  externalId: string | null;
  /** Full SCIM resource snapshot. */
  payload: Record<string, unknown>;
  /** ISO timestamp the event was raised. */
  occurredAt: string;
}

export interface IScimPushDelivery {
  id: string;
  eventId: string;
  subscriptionId: string;
  status: ScimPushDeliveryStatus;
  attempts: number;
  /** ISO timestamp of the last attempt. */
  lastAttemptAt: string | null;
  /** HTTP status of the last attempt; null when no attempt yet. */
  lastStatusCode: number | null;
  /** Last error message (response body or transport error). */
  lastError: string | null;
  /** Next scheduled retry; null when terminal. */
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IScimPushDeliveryAttempt {
  deliveryId: string;
  attemptNumber: number;
  attemptedAt: string;
  statusCode: number | null;
  error: string | null;
  durationMs: number;
}

export interface IScimPushOutcome {
  deliveryId: string;
  status: ScimPushDeliveryStatus;
  attempts: number;
  /** True when delivery moved to dead-letter after exhausting retries. */
  deadLettered: boolean;
}

export interface IScimPushOptions {
  /** Override wall-clock for tests. */
  now?: Date;
  /** Maximum attempts before dead-letter; default 5. */
  maxAttempts?: number;
  /** Base back-off in ms; default 1000 (doubled per retry). */
  baseBackoffMs?: number;
  /** Cap on back-off between retries. */
  maxBackoffMs?: number;
}

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_BASE_BACKOFF_MS = 1000;
export const DEFAULT_MAX_BACKOFF_MS = 60_000;
export const MAX_SUBSCRIPTIONS_PER_ORG = 8;
export const MAX_FILTER_KINDS = 32;

/** Subscription labels shown in the admin UI. */
export const SCIM_PUSH_KIND_LABELS: Record<ScimPushEventKind, string> = {
  'user.created': '用户创建',
  'user.updated': '用户更新',
  'user.deactivated': '用户停用',
  'user.deleted': '用户删除',
  'group.created': '群组创建',
  'group.updated': '群组更新',
  'group.deleted': '群组删除',
  'group.members.added': '成员加入',
  'group.members.removed': '成员移出',
};
