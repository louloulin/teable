/**
 * Collaborator — thin-DI wrapper (Stage N).
 *
 * Pure helpers used by `CollaboratorAuthService`. The role label / rank
 * table is intentionally trivial — the real canManageRole logic lives in
 * `@teable/core`.
 */

import type {
  CollaboratorAction,
  CollaboratorRoleLabel,
  ICollaboratorSummary,
} from './collaborator.types';

const labelByRole: Record<string, CollaboratorRoleLabel> = {
  owner: 'owner',
  admin: 'admin',
  editor: 'editor',
  viewer: 'viewer',
  commenter: 'commenter',
  'no-access': 'no-access',
};

const rankByRole: Record<CollaboratorRoleLabel, number> = {
  owner: 5,
  admin: 4,
  editor: 3,
  commenter: 2,
  viewer: 1,
  'no-access': 0,
};

/** Format the role string into a stable label. */
export function formatRoleLabel(role: string): CollaboratorRoleLabel {
  return labelByRole[role.toLowerCase()] ?? 'no-access';
}

/** Stable numeric rank for the role (higher = stronger). */
export function rankCollaboratorActions(role: string): number {
  return rankByRole[formatRoleLabel(role)];
}

/** Build a summary stub from raw row data (only the fields used by callers). */
export function toCollaboratorSummary(row: {
  resourceId: string;
  resourceType: string;
  principalId: string;
  principalType: string;
  roleName: string;
  createdTime: Date;
}): ICollaboratorSummary {
  const label = formatRoleLabel(row.roleName);
  return {
    resourceId: row.resourceId,
    resourceType: row.resourceType,
    principalId: row.principalId,
    principalType: row.principalType,
    roleName: row.roleName,
    label,
    rank: rankByRole[label],
    createdTime: row.createdTime,
  };
}

/** Allowed action list per role — used by the auth gate. */
export function actionsForRole(role: string): CollaboratorAction[] {
  const label = formatRoleLabel(role);
  if (label === 'owner' || label === 'admin') {
    return ['create', 'update', 'delete', 'invite'];
  }
  if (label === 'editor') return ['create', 'update'];
  return [];
}
