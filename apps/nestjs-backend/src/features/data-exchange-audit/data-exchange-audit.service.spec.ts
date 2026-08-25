/**
 * Data exchange audit trail — pure helpers spec (Stage 89).
 */

import {
  appendEvent,
  lastHash,
  queryEvents,
  validateEvent,
  verifyChain,
} from './data-exchange-audit.service';
import type { IAuditEvent } from './data-exchange-audit.types';
import { MAX_AUDIT_METADATA_BYTES } from './data-exchange-audit.types';

const baseEvent = (over: Partial<IAuditEvent> = {}): IAuditEvent => ({
  id: 'evt-1',
  orgId: 'o1',
  actor: 'user-1',
  action: 'export',
  metadata: { rows: 100 },
  occurredAt: '2026-01-01T00:00:00Z',
  chainHash: 'a'.repeat(64),
  ...over,
});

describe('data-exchange-audit.validateEvent', () => {
  it('passes', () => {
    expect(validateEvent(baseEvent())).toBeNull();
  });
  it('rejects missing id', () => {
    expect(validateEvent(baseEvent({ id: '' }))).toContain('id');
  });
  it('rejects oversized metadata', () => {
    const big = { pad: 'x'.repeat(MAX_AUDIT_METADATA_BYTES) };
    expect(validateEvent(baseEvent({ metadata: big }))).toContain('exceeds');
  });
});

describe('data-exchange-audit.appendEvent', () => {
  it('starts with empty prevHash', () => {
    const out = appendEvent({
      events: [],
      next: {
        id: 'evt-1',
        orgId: 'o1',
        actor: 'user-1',
        action: 'export',
        metadata: {},
        occurredAt: '2026-01-01T00:00:00Z',
      },
      now: '2026-01-01T00:00:00Z',
    });
    expect(out[0]?.chainHash.length).toBe(64);
  });
  it('links chain to previous', () => {
    const first = appendEvent({
      events: [],
      next: {
        id: 'evt-1',
        orgId: 'o1',
        actor: 'user-1',
        action: 'export',
        metadata: {},
        occurredAt: '2026-01-01T00:00:00Z',
      },
      now: '2026-01-01T00:00:00Z',
    });
    const second = appendEvent({
      events: first,
      next: {
        id: 'evt-2',
        orgId: 'o1',
        actor: 'user-2',
        action: 'import',
        metadata: {},
        occurredAt: '2026-01-01T00:00:01Z',
      },
      now: '2026-01-01T00:00:01Z',
    });
    expect(second[1]?.chainHash).not.toBe(first[0]?.chainHash);
  });
});

describe('data-exchange-audit.verifyChain', () => {
  it('ok for valid chain', () => {
    const e1 = appendEvent({
      events: [],
      next: {
        id: 'evt-1',
        orgId: 'o1',
        actor: 'u',
        action: 'export',
        metadata: {},
        occurredAt: '2026-01-01T00:00:00Z',
      },
      now: '2026-01-01T00:00:00Z',
    });
    const e2 = appendEvent({
      events: e1,
      next: {
        id: 'evt-2',
        orgId: 'o1',
        actor: 'u',
        action: 'import',
        metadata: {},
        occurredAt: '2026-01-01T00:00:01Z',
      },
      now: '2026-01-01T00:00:01Z',
    });
    expect(verifyChain(e2).ok).toBe(true);
  });
  it('broken when tampered', () => {
    const e1 = appendEvent({
      events: [],
      next: {
        id: 'evt-1',
        orgId: 'o1',
        actor: 'u',
        action: 'export',
        metadata: {},
        occurredAt: '2026-01-01T00:00:00Z',
      },
      now: '2026-01-01T00:00:00Z',
    });
    const tampered = [{ ...e1[0]!, actor: 'attacker' }];
    expect(verifyChain(tampered).ok).toBe(false);
  });
});

describe('data-exchange-audit.queryEvents', () => {
  it('filters by action', () => {
    const events: IAuditEvent[] = [
      baseEvent({ id: 'e1', action: 'export' }),
      baseEvent({ id: 'e2', action: 'import' }),
    ];
    const out = queryEvents({ events, query: { orgId: 'o1', action: 'import' } });
    expect(out.length).toBe(1);
    expect(out[0]?.id).toBe('e2');
  });
  it('respects limit', () => {
    const events: IAuditEvent[] = [
      baseEvent({ id: 'e1', occurredAt: '2026-01-01T00:00:00Z' }),
      baseEvent({ id: 'e2', occurredAt: '2026-01-02T00:00:00Z' }),
      baseEvent({ id: 'e3', occurredAt: '2026-01-03T00:00:00Z' }),
    ];
    const out = queryEvents({ events, query: { orgId: 'o1', limit: 2 } });
    expect(out.length).toBe(2);
    expect(out[1]?.id).toBe('e3');
  });
});

describe('data-exchange-audit.lastHash', () => {
  it('empty when no events', () => {
    expect(lastHash([], 'o1')).toBe('');
  });
  it('returns last for org', () => {
    const events: IAuditEvent[] = [
      baseEvent({ id: 'e1', orgId: 'o1', chainHash: 'aaa' }),
      baseEvent({ id: 'e2', orgId: 'o2', chainHash: 'bbb' }),
      baseEvent({ id: 'e3', orgId: 'o1', chainHash: 'ccc' }),
    ];
    expect(lastHash(events, 'o1')).toBe('ccc');
    expect(lastHash(events, 'o2')).toBe('bbb');
  });
});
