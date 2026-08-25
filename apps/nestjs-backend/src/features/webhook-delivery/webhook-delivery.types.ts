/**
 * Webhook delivery — Stage 53.
 *
 * Outbound webhook dispatcher with retry + dead-letter queue.
 * Storage lives in Prisma (`webhookDelivery`), the dispatcher
 * itself is a state machine that picks up due rows, signs and
 * POSTs them, and records the result.
 */

export type WebhookStatus = 'pending' | 'in_flight' | 'delivered' | 'failed' | 'dead';

export type WebhookMethod = 'POST' | 'PUT';

export interface IWebhookEndpoint {
  id: string;
  url: string;
  secret: string;
  /** Custom headers to send with every request. */
  headers?: Record<string, string>;
  /** Event filter (e.g. ['record.update']). Empty = all. */
  events: ReadonlyArray<string>;
  /** Max attempts before going to dead-letter. */
  maxAttempts: number;
  /** Whether the endpoint is currently enabled. */
  enabled: boolean;
  createdTime: Date;
}

export interface IWebhookPayload {
  id: string;
  event: string;
  createdTime: Date;
  body: string;
}

export interface IWebhookDelivery {
  id: string;
  endpointId: string;
  payloadId: string;
  status: WebhookStatus;
  attempt: number;
  maxAttempts: number;
  /** When the delivery is next eligible for retry. */
  nextAttemptAt: Date;
  /** Last response status code, if any. */
  lastStatusCode?: number;
  /** Last error message (network or HTTP error). */
  lastError?: string;
  /** When the delivery was last attempted. */
  lastAttemptAt?: Date;
  /** When the delivery was finalized (delivered or dead). */
  finalizedAt?: Date;
  deliveredAt?: Date;
  createdTime: Date;
}

export interface IDispatchResult {
  deliveryId: string;
  status: WebhookStatus;
  attempt: number;
  nextAttemptAt?: Date;
  lastStatusCode?: number;
  lastError?: string;
}

export interface IWebhookDispatcher {
  send(args: {
    method: WebhookMethod;
    url: string;
    body: string;
    secret: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{ statusCode: number; body: string }>;
}

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_BASE_BACKOFF_MS = 1_000;
export const DEFAULT_MAX_BACKOFF_MS = 60_000;
export const MAX_BACKOFF_MULTIPLIER = 8;
