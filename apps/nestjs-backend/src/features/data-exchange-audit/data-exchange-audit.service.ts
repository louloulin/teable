/**
 * Data exchange audit trail — pure helpers (Stage 89).
 */

import type {
  IAuditEvent,
  IAuditQuery,
} from './data-exchange-audit.types';
import {
  hashEvent,
  MAX_AUDIT_EVENTS_PER_ORG,
  MAX_AUDIT_METADATA_BYTES,
} from './data-exchange-audit.types';

/** Validate an audit event. */
export function validateEvent(e: IAuditEvent): string | null {
  if (!e.id) return 'id required';
  if (!e.orgId) return 'orgId required';
  if (!e.actor) return 'actor required';
  if (!e.action) return 'action required';
  if (!e.occurredAt) return 'occurredAt required';
  if (!e.chainHash) return 'chainHash required';
  const metaSize = Buffer.byteLength(JSON.stringify(e.metadata), 'utf8');
  if (metaSize > MAX_AUDIT_METADATA_BYTES) {
    return `metadata exceeds ${MAX_AUDIT_METADATA_BYTES} bytes`;
  }
  return null;
}

/** Append an event with chain hash linking to the previous event. */
export function appendEvent(input: {
  events: ReadonlyArray<IAuditEvent>;
  next: Omit<IAuditEvent, 'chainHash'>;
  now: string;
}): IAuditEvent[] {
  const prev = input.events[input.events.length - 1];
  const prevHash = prev?.chainHash ?? '';
  const chainHash = hashEvent({
    id: input.next.id,
    orgId: input.next.orgId,
    actor: input.next.actor,
    action: input.next.action,
    recordId: input.next.recordId,
    metadata: input.next.metadata,
    occurredAt: input.next.occurredAt,
    prevHash,
  });
  const full: IAuditEvent = { ...input.next, chainHash };
  return [...input.events, full].slice(-MAX_AUDIT_EVENTS_PER_ORG);
}

/** Verify the chain integrity of an event list. */
export function verifyChain(events: ReadonlyArray<IAuditEvent>): { ok: boolean; brokenAt?: number } {
  let prevHash = '';
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!;
    const expected = hashEvent({
      id: e.id,
      orgId: e.orgId,
      actor: e.actor,
      action: e.action,
      recordId: e.recordId,
      metadata: e.metadata,
      occurredAt: e.occurredAt,
      prevHash,
    });
    if (expected !== e.chainHash) return { ok: false, brokenAt: i };
    prevHash = e.chainHash;
  }
  return { ok: true };
}

/** Query events for an org with filters. */
export function queryEvents(input: {
  events: ReadonlyArray<IAuditEvent>;
  query: IAuditQuery;
}): IAuditEvent[] {
  let out = input.events.filter((e) => e.orgId === input.query.orgId);
  if (input.query.action) out = out.filter((e) => e.action === input.query.action);
  if (input.query.actor) out = out.filter((e) => e.actor === input.query.actor);
  if (input.query.recordId) out = out.filter((e) => e.recordId === input.query.recordId);
  if (input.query.since) {
    const since = Date.parse(input.query.since);
    out = out.filter((e) => Date.parse(e.occurredAt) >= since);
  }
  if (input.query.until) {
    const until = Date.parse(input.query.until);
    out = out.filter((e) => Date.parse(e.occurredAt) <= until);
  }
  out = out.slice().sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  if (typeof input.query.limit === 'number') {
    out = out.slice(-input.query.limit);
  }
  return out;
}

/** Latest event hash for an org — used as the anchor for new chains. */
export function lastHash(events: ReadonlyArray<IAuditEvent>, orgId: string): string {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]!.orgId === orgId) return events[i]!.chainHash;
  }
  return '';
}
