/**
 * Interceptor guard — types (Stage 92).
 */

export type AuditAction =
  | 'read'
  | 'create'
  | 'update'
  | 'delete'
  | 'export'
  | 'admin';

export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'internal';

export interface IAuthContext {
  /** Authenticated principal (e.g. user id) or null for anonymous. */
  principal: string | null;
  /** Roles assigned to the principal. */
  roles: string[];
  /** Operation target resource id (for audit). */
  targetId?: string;
  /** Original HTTP verb or action label. */
  action: AuditAction;
}

export interface IErrorEnvelope {
  code: ErrorCode;
  message: string;
  /** Correlation id — appears in logs and audit trail. */
  traceId: string;
  /** HTTP status the gateway should emit. */
  status: number;
}

export interface IAuditRecord {
  /** Action verb. */
  action: AuditAction;
  /** Acting principal. */
  principal: string;
  /** Resource id (may be empty for cross-cutting events). */
  resourceId: string;
  /** Stable outcome — "ok" / "denied" / "error". */
  outcome: 'ok' | 'denied' | 'error';
  /** Trace id used to correlate with IErrorEnvelope. */
  traceId: string;
  /** ISO-8601 timestamp. */
  occurredAt: string;
  /** Free-form context (route, ip, request id, etc). */
  context: Record<string, string>;
}

export const MAX_PRINCIPAL_LENGTH = 256;
export const MAX_TRACE_ID_LENGTH = 64;
export const MAX_AUDIT_CONTEXT_KEYS = 32;

export const ROLE_ADMIN = 'admin';
export const ROLE_OWNER = 'owner';