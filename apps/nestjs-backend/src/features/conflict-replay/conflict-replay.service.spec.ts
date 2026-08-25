/**
 * Conflict replay queue — pure helpers spec (Stage 87).
 */

import {
  canRetry,
  drain,
  enqueue,
  markAttempt,
  replay,
  validateEvent,
} from './conflict-replay.service';
import { MAX_CONFLICT_ATTEMPTS } from './conflict-replay.types';
import type { IConflictEvent } from './conflict-replay.types';

const baseEvent = (over: Partial<IConflictEvent> = {}): IConflictEvent => ({
  id: 'evt-1',
  orgId: 'o1',
  recordId: 'r1',
  kind: 'optimistic-lock',
  idempotencyKey: 'idem-1',
  offset: 0,
  attempts: 0,
  enqueuedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('conflict-replay.validateEvent', () => {
  it('passes', () => {
    expect(validateEvent(baseEvent())).toBeNull();
  });
  it('rejects missing fields', () => {
    expect(validateEvent(baseEvent({ id: '' }))).toContain('id');
  });
});

describe('conflict-replay.canRetry', () => {
  it('returns true while under cap', () => {
    expect(canRetry(baseEvent({ attempts: MAX_CONFLICT_ATTEMPTS - 1 }))).toBe(true);
  });
  it('returns false at cap', () => {
    expect(canRetry(baseEvent({ attempts: MAX_CONFLICT_ATTEMPTS }))).toBe(false);
  });
});

describe('conflict-replay.enqueue', () => {
  it('appends', () => {
    const out = enqueue({ events: [], next: baseEvent(), now: Date.parse('2026-01-01T00:00:01Z') });
    expect(out.length).toBe(1);
  });
  it('dedupes by idempotency key inside window', () => {
    const out = enqueue({
      events: [baseEvent()],
      next: baseEvent({ id: 'evt-2', offset: 1 }),
      now: Date.parse('2026-01-01T00:00:01Z'),
    });
    expect(out.length).toBe(1);
  });
  it('appends when outside window', () => {
    const out = enqueue({
      events: [baseEvent()],
      next: baseEvent({ id: 'evt-2', offset: 1 }),
      now: Date.parse('2026-01-02T00:00:00Z'),
    });
    expect(out.length).toBe(2);
  });
});

describe('conflict-replay.markAttempt', () => {
  it('stamps', () => {
    const out = markAttempt({ event: baseEvent(), ok: true, now: Date.parse('2026-01-02T00:00:00Z') });
    expect(out.attempts).toBe(1);
    expect(out.lastAttemptAt).toBe('2026-01-02T00:00:00.000Z');
  });
  it('records error on failure', () => {
    const out = markAttempt({
      event: baseEvent(),
      ok: false,
      now: Date.parse('2026-01-02T00:00:00Z'),
      error: 'oops',
    });
    expect(out.lastError).toBe('oops');
  });
});

describe('conflict-replay.replay', () => {
  it('drops when applier returns true', () => {
    const { event, attempt } = replay({
      event: baseEvent(),
      applier: () => true,
      now: Date.parse('2026-01-02T00:00:00Z'),
    });
    expect(attempt.ok).toBe(true);
    expect(event.lastError).toBeUndefined();
  });
  it('keeps when applier returns false', () => {
    const { event, attempt } = replay({
      event: baseEvent(),
      applier: () => false,
      now: Date.parse('2026-01-02T00:00:00Z'),
    });
    expect(attempt.ok).toBe(false);
    expect(event.lastError).toBe('applier returned false');
  });
  it('captures applier exception', () => {
    const { attempt } = replay({
      event: baseEvent(),
      applier: () => {
        throw new Error('boom');
      },
      now: Date.parse('2026-01-02T00:00:00Z'),
    });
    expect(attempt.error).toBe('boom');
  });
});

describe('conflict-replay.drain', () => {
  it('drains sorted by offset', () => {
    const a = baseEvent({ id: 'a', offset: 1 });
    const b = baseEvent({ id: 'b', offset: 0 });
    const seen: string[] = [];
    const { remaining } = drain({
      events: [a, b],
      applier: (e) => {
        seen.push(e.id);
        return true;
      },
      now: Date.parse('2026-01-02T00:00:00Z'),
    });
    expect(seen[0]).toBe('b');
    expect(remaining.length).toBe(0);
  });
  it('keeps failed', () => {
    const { remaining } = drain({
      events: [baseEvent()],
      applier: () => false,
      now: Date.parse('2026-01-02T00:00:00Z'),
    });
    expect(remaining.length).toBe(1);
  });
  it('drops exhausted', () => {
    const { remaining, attempts } = drain({
      events: [baseEvent({ attempts: MAX_CONFLICT_ATTEMPTS })],
      applier: () => true,
      now: Date.parse('2026-01-02T00:00:00Z'),
    });
    expect(remaining.length).toBe(0);
    expect(attempts[0]?.error).toBe('max attempts');
  });
});
