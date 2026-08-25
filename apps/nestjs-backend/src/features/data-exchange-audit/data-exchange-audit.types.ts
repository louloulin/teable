/**
 * Data exchange audit trail — types (Stage 89).
 */

import { createHash } from 'node:crypto';

export type AuditAction =
  | 'export'
  | 'import'
  | 'sync'
  | 'pipeline-run'
  | 'conflict-resolved'
  | 'webhook-dispatch'
  | 'share-link';

export interface IAuditEvent {
  id: string;
  orgId: string;
  actor: string;
  action: AuditAction;
  recordId?: string;
  /** Free-form metadata for the action. */
  metadata: Record<string, unknown>;
  /** UTC ISO timestamp. */
  occurredAt: string;
  /** SHA-256 hex chain — links to previous event in the org. */
  chainHash: string;
}

export interface IAuditQuery {
  orgId: string;
  action?: AuditAction;
  actor?: string;
  recordId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export const AUDIT_HASH_ALGO = 'sha256';
export const MAX_AUDIT_EVENTS_PER_ORG = 100_000;
export const MAX_AUDIT_METADATA_BYTES = 8 * 1024;

export function hashEvent(input: {
  id: string;
  orgId: string;
  actor: string;
  action: AuditAction;
  recordId?: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  prevHash: string;
}): string {
  const h = createHash(AUDIT_HASH_ALGO);
  h.update(input.prevHash);
  h.update('|');
  h.update(input.orgId);
  h.update('|');
  h.update(input.actor);
  h.update('|');
  h.update(input.action);
  h.update('|');
  h.update(input.recordId ?? '');
  h.update('|');
  h.update(JSON.stringify(input.metadata));
  h.update('|');
  h.update(input.occurredAt);
  h.update('|');
  h.update(input.id);
  return h.digest('hex');
}
