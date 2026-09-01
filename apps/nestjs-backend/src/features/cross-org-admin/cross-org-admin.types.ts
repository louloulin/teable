/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Cross-org admin grants — types (Round-INFRA-5).
 *
 * Mirrors Cloud's "Cross-organization administration" feature:
 * a user can be granted scoped admin access to an organization
 * other than their home org.
 *
 * License: AGPL-3.0
 */
export interface ICrossOrgAdminGrant {
  id: string;
  userId: string;
  /** The actual authorization target in the current schema. */
  spaceId: string;
  /** Deprecated response alias retained for existing admin clients. */
  orgId: string;
  grantedBy: string;
  grantedAt: Date;
  createdTime: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
  role: string;
  reason: string | null;
  /** Deprecated compatibility projection; scopes are not persisted by the schema. */
  scopes: string[];
}

export const CROSS_ORG_ADMIN_DEFAULT_SCOPES: ReadonlyArray<string> = [
  'space:read',
  'space:list',
  'audit:read',
  'ai_usage:read',
];
