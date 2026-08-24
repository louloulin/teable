import type { Prisma } from '@teable/db-main-prisma';

/**
 * Public types — mirrors the help guide's data model:
 *   role → table access node (none / editable)
 *              ├── record filter (JSON DSL, may reference "current user")
 *              ├── field permissions (hidden / readonly / editable)
 *              └── record actions (view / update / create / delete / comment)
 */

export const PERMISSION_MATRIX_CAPABILITY = 'permission_matrix' as const;

/**
 * Filter expression — same shape as the public record filter DSL but
 * limited to what we know how to evaluate server-side. We re-use the
 * evaluator from `@teable/core` (see `parseFilter`); storing as `Json`
 * means the table doesn't migrate when the public DSL evolves.
 */
export type PermissionFilter = Prisma.JsonValue;

export interface IPermissionRoleVo {
  id: string;
  baseId: string;
  name: string;
  description: string | null;
  status: 'enabled' | 'disabled';
  members: string[];
  nodes: { tableId: string; access: 'none' | 'editable' }[];
  fieldPermissions: { tableId: string; fieldId: string; access: 'hidden' | 'readonly' | 'editable' }[];
  recordActions: { tableId: string; action: 'view' | 'update' | 'create' | 'delete' | 'comment' }[];
  recordFilter: { tableId: string; filter: PermissionFilter } | null;
}

/**
 * Sentinel used inside `PermissionFilter` to mean "the authenticated
 * user's id". Evaluated against `cls.user.id` at read time. Mirrors the
 * guide's "负责销售 等于 当前用户" use case.
 */
export const CURRENT_USER_SENTINEL = '$current_user' as const;

/** True if the filter contains a "current user" reference. */
export function filterReferencesCurrentUser(filter: PermissionFilter): boolean {
  if (filter === null || filter === undefined) return false;
  if (typeof filter === 'object') {
    const json = JSON.stringify(filter);
    return json.includes(CURRENT_USER_SENTINEL);
  }
  return false;
}
