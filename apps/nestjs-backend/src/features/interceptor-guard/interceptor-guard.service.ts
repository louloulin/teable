/**
 * Interceptor guard — pure helpers (Stage 92).
 */

import type {
  AuditAction,
  IAuditRecord,
  IAuthContext,
  IErrorEnvelope,
  ErrorCode,
} from './interceptor-guard.types';
import {
  MAX_AUDIT_CONTEXT_KEYS,
  MAX_PRINCIPAL_LENGTH,
  MAX_TRACE_ID_LENGTH,
} from './interceptor-guard.types';

const ACTIONS: ReadonlySet<AuditAction> = new Set([
  'read',
  'create',
  'update',
  'delete',
  'export',
  'admin',
]);

/** Validate an auth context. */
export function validateAuth(ctx: IAuthContext): string | null {
  if (!ACTIONS.has(ctx.action)) return `unknown action: ${ctx.action}`;
  if (!Array.isArray(ctx.roles)) return 'roles must be an array';
  if (ctx.principal && ctx.principal.length > MAX_PRINCIPAL_LENGTH) {
    return `principal too long (${MAX_PRINCIPAL_LENGTH})`;
  }
  return null;
}

/** Decide whether the principal is allowed to perform the action. */
export function isAuthorized(input: {
  ctx: IAuthContext;
  requiredRoles?: ReadonlyArray<string>;
}): boolean {
  if (!input.ctx.principal) return false;
  const required = input.requiredRoles ?? [];
  if (required.length === 0) return true;
  for (const r of required) {
    if (input.ctx.roles.includes(r)) return true;
  }
  return false;
}

/** Build a stable error envelope. */
export function buildError(input: {
  code: ErrorCode;
  message: string;
  traceId: string;
}): IErrorEnvelope {
  if (!input.traceId || input.traceId.length > MAX_TRACE_ID_LENGTH) {
    throw new Error('traceId required and bounded');
  }
  return {
    code: input.code,
    message: input.message,
    traceId: input.traceId,
    status: statusFor(input.code),
  };
}

/** Map an error code to a numeric HTTP status. */
export function statusFor(code: ErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401;
    case 'forbidden':
      return 403;
    case 'not_found':
      return 404;
    case 'conflict':
      return 409;
    case 'validation':
      return 422;
    case 'rate_limited':
      return 429;
    case 'internal':
      return 500;
    default:
      return 500;
  }
}

/** Build an audit record from an auth context + outcome. */
export function buildAudit(input: {
  ctx: IAuthContext;
  outcome: 'ok' | 'denied' | 'error';
  traceId: string;
  now: string;
  context?: Record<string, string>;
}): IAuditRecord {
  const ctx = input.context ?? {};
  const keys = Object.keys(ctx);
  if (keys.length > MAX_AUDIT_CONTEXT_KEYS) {
    throw new Error(`audit context cap ${MAX_AUDIT_CONTEXT_KEYS}`);
  }
  return {
    action: input.ctx.action,
    principal: input.ctx.principal ?? 'anonymous',
    resourceId: input.ctx.targetId ?? '',
    outcome: input.outcome,
    traceId: input.traceId,
    occurredAt: input.now,
    context: ctx,
  };
}

/** Decide whether to short-circuit (deny) based on auth + outcome. */
export function shouldDeny(input: { ctx: IAuthContext; requiredRoles?: ReadonlyArray<string> }): boolean {
  return !isAuthorized(input);
}

/** Combine auth result into a single outcome. */
export function outcomeFor(input: {
  ctx: IAuthContext;
  requiredRoles?: ReadonlyArray<string>;
  errored?: boolean;
}): 'ok' | 'denied' | 'error' {
  if (input.errored) return 'error';
  if (shouldDeny(input)) return 'denied';
  return 'ok';
}