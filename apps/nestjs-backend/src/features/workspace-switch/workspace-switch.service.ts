/**
 * Workspace switcher — Stage 27.
 *
 * Pure helpers for short-lived switch tokens + cross-org admin grants.
 * Token format: `wss_<48 hex>` (>= 192 bits of entropy).
 *
 * No Prisma here so the token/crypto math is unit-testable.
 */

import { createHash, randomBytes } from 'node:crypto';

import type {
  CrossOrgRole,
  IConsumeResult,
  ICreateSwitchInput,
  IEffectiveRoleResult,
  IGrantInput,
  IWorkspaceSwitchSession,
} from './workspace-switch.types';

const DEFAULT_TTL_SECONDS = 5 * 60;
export const ROLE_RANK: Record<CrossOrgRole, number> = { owner: 2, admin: 1 };

export function generateSwitchToken(): string {
  return `wss_${randomBytes(24).toString('hex')}`;
}

/** SHA-256 hex of the token — what we actually persist server-side. */
export function hashSwitchToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Lifetime in ms from now, clamped to [1s, 1h]. */
export function resolveTtlMs(ttlSeconds?: number): number {
  const raw = ttlSeconds ?? DEFAULT_TTL_SECONDS;
  return Math.max(1_000, Math.min(60 * 60 * 1_000, raw * 1_000));
}

/** Build the row to persist. */
export function buildSessionRow(
  input: ICreateSwitchInput & {
    id: string;
    now?: Date;
  }
): IWorkspaceSwitchSession {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + resolveTtlMs(input.ttlSeconds));
  return {
    id: input.id,
    userId: input.userId,
    fromSpaceId: input.fromSpaceId,
    toSpaceId: input.toSpaceId,
    token: hashSwitchToken(input.token ?? ''),
    expiresAt,
    consumedAt: null,
    createdTime: now,
  };
}

/** Decide whether a stored session can still be consumed. */
export function evaluateConsumption(input: {
  session: IWorkspaceSwitchSession | null;
  now?: Date;
}): IConsumeResult {
  if (!input.session) return { ok: false, toSpaceId: null, reason: 'unknown' };
  const now = input.now ?? new Date();
  if (input.session.consumedAt) return { ok: false, toSpaceId: null, reason: 'expired' };
  if (input.session.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, toSpaceId: null, reason: 'expired' };
  }
  return { ok: true, toSpaceId: input.session.toSpaceId, reason: 'consumed' };
}

/** Verify a presented token matches the stored hash. Constant-time. */
export function verifyToken(presented: string, storedHash: string): boolean {
  const candidate = hashSwitchToken(presented);
  if (candidate.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}

/** Compute the effective role from base + cross-org grant. */
export function computeEffectiveRole(input: {
  baseRole: CrossOrgRole | null;
  crossOrgRole: CrossOrgRole | null;
}): IEffectiveRoleResult {
  if (!input.crossOrgRole) {
    return { baseRole: input.baseRole, elevated: false, effective: input.baseRole };
  }
  if (!input.baseRole) {
    return { baseRole: null, elevated: true, effective: input.crossOrgRole };
  }
  return ROLE_RANK[input.crossOrgRole] > ROLE_RANK[input.baseRole]
    ? { baseRole: input.baseRole, elevated: true, effective: input.crossOrgRole }
    : { baseRole: input.baseRole, elevated: false, effective: input.baseRole };
}

/** Coerce unknown role string → CrossOrgRole | null. */
export function coerceRole(input: string | null | undefined): CrossOrgRole | null {
  if (input === 'admin' || input === 'owner') return input;
  return null;
}

/** Decide whether a stored grant is currently active. */
export function isGrantActive(input: {
  grant: { expiresAt: Date | null; revokedAt: Date | null };
  now?: Date;
}): boolean {
  if (input.grant.revokedAt) return false;
  const now = input.now ?? new Date();
  if (input.grant.expiresAt && input.grant.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/** Compute expiry for a grant. Null = no expiry. */
export function resolveGrantExpiresAt(input: { ttlSeconds?: number; now?: Date }): Date | null {
  if (input.ttlSeconds === undefined || input.ttlSeconds === null) return null;
  if (input.ttlSeconds <= 0) return null;
  const now = input.now ?? new Date();
  return new Date(now.getTime() + input.ttlSeconds * 1_000);
}

export function coerceCreateSwitchInput(input: ICreateSwitchInput): ICreateSwitchInput {
  return {
    userId: input.userId,
    fromSpaceId: input.fromSpaceId,
    toSpaceId: input.toSpaceId,
    ttlSeconds: input.ttlSeconds,
  };
}

export function coerceGrantInput(input: IGrantInput): IGrantInput {
  return {
    userId: input.userId,
    spaceId: input.spaceId,
    grantedBy: input.grantedBy,
    role: input.role,
    reason: input.reason ?? null,
    ttlSeconds: input.ttlSeconds,
  };
}
