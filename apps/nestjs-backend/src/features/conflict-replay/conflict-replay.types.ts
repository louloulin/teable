/**
 * Conflict replay queue — types (Stage 87).
 */

export type ConflictKind = 'optimistic-lock' | 'duplicate-write' | 'stale-read' | 'incompatible-version';

export interface IConflictEvent {
  id: string;
  orgId: string;
  recordId: string;
  kind: ConflictKind;
  /** Idempotency key — replays with the same key are coalesced. */
  idempotencyKey: string;
  /** Monotonic offset inside the queue. */
  offset: number;
  attempts: number;
  /** Last failure message. */
  lastError?: string;
  /** UTC ISO timestamp. */
  enqueuedAt: string;
  /** UTC ISO timestamp of last attempt. */
  lastAttemptAt?: string;
}

export interface IReplayAttempt {
  eventId: string;
  offset: number;
  ok: boolean;
  attempts: number;
  /** Remaining idempotency budget — caps retries per key. */
  retriesRemaining: number;
  error?: string;
}

export const MAX_CONFLICT_ATTEMPTS = 5;
export const MAX_QUEUE_SIZE = 4096;
export const IDEMPOTENCY_DEDUP_WINDOW_MS = 60_000;
