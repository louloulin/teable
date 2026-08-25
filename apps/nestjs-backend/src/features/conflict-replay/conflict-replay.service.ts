/**
 * Conflict replay queue — pure helpers (Stage 87).
 */

import type {
  IConflictEvent,
  IReplayAttempt,
} from './conflict-replay.types';
import {
  IDEMPOTENCY_DEDUP_WINDOW_MS,
  MAX_CONFLICT_ATTEMPTS,
  MAX_QUEUE_SIZE,
} from './conflict-replay.types';

/** Validate an event. */
export function validateEvent(e: IConflictEvent): string | null {
  if (!e.id) return 'id required';
  if (!e.orgId) return 'orgId required';
  if (!e.recordId) return 'recordId required';
  if (!e.idempotencyKey) return 'idempotencyKey required';
  if (!Number.isFinite(e.offset)) return 'offset must be a number';
  return null;
}

/** Enqueue, deduping by idempotency key within the window. */
export function enqueue(input: {
  events: ReadonlyArray<IConflictEvent>;
  next: IConflictEvent;
  now: number;
}): IConflictEvent[] {
  if (input.events.length >= MAX_QUEUE_SIZE) return input.events.slice();
  const within = input.events.find(
    (e) =>
      e.idempotencyKey === input.next.idempotencyKey &&
      input.now - Date.parse(e.enqueuedAt) <= IDEMPOTENCY_DEDUP_WINDOW_MS
  );
  if (within) return input.events.slice();
  return [...input.events, input.next].slice(-MAX_QUEUE_SIZE);
}

/** Whether the event can still be retried. */
export function canRetry(e: IConflictEvent): boolean {
  return e.attempts < MAX_CONFLICT_ATTEMPTS;
}

/** Mark an attempt — increments and stamps time, returns the updated event. */
export function markAttempt(input: {
  event: IConflictEvent;
  ok: boolean;
  now: number;
  error?: string;
}): IConflictEvent {
  const next: IConflictEvent = {
    ...input.event,
    attempts: input.event.attempts + 1,
    lastAttemptAt: new Date(input.now).toISOString(),
  };
  if (!input.ok) next.lastError = input.error ?? 'unknown';
  return next;
}

/** Replay a single event: return the new event after the attempt plus an attempt record. */
export function replay(input: {
  event: IConflictEvent;
  applier: (e: IConflictEvent) => boolean;
  now: number;
}): { event: IConflictEvent; attempt: IReplayAttempt } {
  let ok = false;
  try {
    ok = input.applier(input.event);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unknown';
    const event = markAttempt({ event: input.event, ok: false, now: input.now, error });
    return { event, attempt: toAttempt(event, false, error) };
  }
  const event = markAttempt({
    event: input.event,
    ok,
    now: input.now,
    error: ok ? undefined : 'applier returned false',
  });
  return { event, attempt: toAttempt(event, ok, ok ? undefined : 'applier returned false') };
}

/** Drain events in offset order, replaying each. */
export function drain(input: {
  events: ReadonlyArray<IConflictEvent>;
  applier: (e: IConflictEvent) => boolean;
  now: number;
}): { remaining: IConflictEvent[]; attempts: IReplayAttempt[] } {
  const sorted = input.events.slice().sort((a, b) => a.offset - b.offset);
  const remaining: IConflictEvent[] = [];
  const attempts: IReplayAttempt[] = [];
  for (const e of sorted) {
    if (!canRetry(e)) {
      attempts.push(toAttempt(e, false, 'max attempts'));
      continue;
    }
    const { event, attempt } = replay({
      event: e,
      applier: input.applier,
      now: input.now,
    });
    if (!event.lastError) {
      // success — drop from queue
      attempts.push(attempt);
    } else {
      attempts.push(attempt);
      remaining.push(event);
    }
  }
  return { remaining, attempts };
}

/** Compose an attempt record from an event. */
export function toAttempt(e: IConflictEvent, ok: boolean, error?: string): IReplayAttempt {
  return {
    eventId: e.id,
    offset: e.offset,
    ok,
    attempts: e.attempts,
    retriesRemaining: Math.max(0, MAX_CONFLICT_ATTEMPTS - e.attempts),
    error,
  };
}
