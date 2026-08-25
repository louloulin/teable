/**
 * View-level permission (Stage 17) — types.
 *
 * Permissions follow the "most specific wins" rule:
 *   1. explicit user-level grant on the view
 *   2. role-level grant on the view (intersected with the user's roles)
 *   3. table-level grant inherited from the view's parent table
 *      (out of scope for Stage 17 — we only enforce view-level rules)
 *   4. default-deny if no rule matches and the user is not the
 *      view creator / table owner.
 *
 * `denied` always wins regardless of where it came from, so an admin
 * can block access even when the user would otherwise have read access.
 */

export const VIEW_PERMISSIONS = ['read', 'write', 'owner', 'denied'] as const;
export type ViewPermissionLevel = (typeof VIEW_PERMISSIONS)[number];
export type ViewSubjectKind = 'user' | 'role';

export interface IViewPermissionRow {
  id: string;
  viewId: string;
  subjectKind: ViewSubjectKind;
  subjectId: string;
  permission: ViewPermissionLevel;
  createdTime: Date;
}

export interface IViewPermissionInput {
  subjectKind: ViewSubjectKind;
  subjectId: string;
  permission: ViewPermissionLevel;
}

export interface IResolveArgs {
  viewId: string;
  viewCreatorId: string;
  userId: string;
  /** Roles the user currently holds on the parent table/base. */
  roleIds: string[];
}

export interface IViewPermissionService {
  list(viewId: string): Promise<IViewPermissionRow[]>;
  grant(viewId: string, input: IViewPermissionInput): Promise<IViewPermissionRow>;
  revoke(viewId: string, subjectKind: ViewSubjectKind, subjectId: string): Promise<boolean>;
  resolve(args: IResolveArgs): Promise<ViewPermissionLevel>;
}
