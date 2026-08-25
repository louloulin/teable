/**
 * Workspace switcher + cross-org admin — Stage 27 types.
 */

export type CrossOrgRole = 'admin' | 'owner';

export interface IWorkspaceSwitchSession {
  id: string;
  userId: string;
  fromSpaceId: string | null;
  toSpaceId: string;
  token: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdTime: Date;
}

export interface ICrossOrgAdminGrant {
  id: string;
  userId: string;
  spaceId: string;
  grantedBy: string;
  role: CrossOrgRole;
  reason: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdTime: Date;
}

export interface ICreateSwitchInput {
  userId: string;
  fromSpaceId: string | null;
  toSpaceId: string;
  /** Token lifetime in seconds; defaults to 5 min. */
  ttlSeconds?: number;
}

export interface IConsumeResult {
  ok: boolean;
  /** The target space when consumed; null when expired or unknown. */
  toSpaceId: string | null;
  reason: 'consumed' | 'expired' | 'unknown';
}

export interface IGrantInput {
  userId: string;
  spaceId: string;
  grantedBy: string;
  role: CrossOrgRole;
  reason?: string | null;
  /** TTL in seconds; omit for non-expiring grant. */
  ttlSeconds?: number;
}

export interface IEffectiveRoleResult {
  /** Native role within the space, or null when none. */
  baseRole: CrossOrgRole | null;
  /** Whether a cross-org grant is currently active. */
  elevated: boolean;
  /** The effective role — max(baseRole, crossOrgRole). */
  effective: CrossOrgRole | null;
}
