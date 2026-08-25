/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Org-level custom roles — Stage 70.
 *
 * Teable ships four built-in roles (`admin`, `builder`, `editor`,
 * `viewer`) that cover 90% of the world. The Cloud tweak: an org can
 * define its own **custom roles** scoped to view / field / row subsets,
 * and stack them on top of the built-ins. Custom roles are owned by an
 * org, but each role binds to one or more bases with a permission
 * expression that is the union of capability flags and resource scopes.
 *
 * Pure decisions live here; the auth service owns persistence.
 */

export type BuiltInRole = 'admin' | 'builder' | 'editor' | 'viewer';

export type CustomRoleCapability =
  | 'base.read'
  | 'base.write'
  | 'base.delete'
  | 'field.create'
  | 'field.update'
  | 'field.delete'
  | 'row.create'
  | 'row.update'
  | 'row.delete'
  | 'view.create'
  | 'view.update'
  | 'view.delete'
  | 'automation.run'
  | 'automation.edit'
  | 'share.create'
  | 'invite.user'
  | 'webhook.manage'
  | 'api-token.manage';

export type RoleScopeKind = 'view' | 'field' | 'row';

export interface IRoleScope {
  kind: RoleScopeKind;
  /** Resource id; row scopes accept a filter expression as id. */
  resourceId: string;
  /** Optional filter expression for row scopes. */
  filter?: string;
}

export interface ICustomRole {
  id: string;
  orgId: string;
  /** Display name shown in admin UI. */
  name: string;
  /** Optional human description. */
  description: string;
  /** Capabilities granted by this role. */
  capabilities: CustomRoleCapability[];
  /** Optional per-resource scopes (view / field / row). */
  scopes: IRoleScope[];
  /** When false the role is hidden from new assignments. */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IRoleAssignment {
  id: string;
  orgId: string;
  /** User this assignment applies to. */
  userId: string;
  /** Either a custom role id or a built-in role name. */
  roleId: string;
  /** When roleId resolves to a custom role, the base binding. */
  baseId: string | null;
  grantedAt: string;
  grantedBy: string;
}

export interface IOrgCustomRoleOptions {
  /** Maximum custom roles per org; defaults to MAX_CUSTOM_ROLES_PER_ORG. */
  maxCustomRoles?: number;
  /** Maximum capabilities per role; defaults to MAX_CAPABILITIES_PER_ROLE. */
  maxCapabilities?: number;
  /** Maximum scopes per role; defaults to MAX_SCOPES_PER_ROLE. */
  maxScopes?: number;
  /** Override "now". */
  now?: string;
}

/** Defaults. */
export const MAX_CUSTOM_ROLES_PER_ORG = 64;
export const MAX_CAPABILITIES_PER_ROLE = 64;
export const MAX_SCOPES_PER_ROLE = 256;
export const MAX_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 512;

/** Built-in role capability lists — used by resolveInherited. */
export const BUILT_IN_ROLE_CAPABILITIES: Record<
  BuiltInRole,
  ReadonlyArray<CustomRoleCapability>
> = {
  admin: [
    'base.read',
    'base.write',
    'base.delete',
    'field.create',
    'field.update',
    'field.delete',
    'row.create',
    'row.update',
    'row.delete',
    'view.create',
    'view.update',
    'view.delete',
    'automation.run',
    'automation.edit',
    'share.create',
    'invite.user',
    'webhook.manage',
    'api-token.manage',
  ],
  builder: [
    'base.read',
    'base.write',
    'field.create',
    'field.update',
    'field.delete',
    'row.create',
    'row.update',
    'row.delete',
    'view.create',
    'view.update',
    'view.delete',
    'automation.run',
    'automation.edit',
    'share.create',
    'webhook.manage',
  ],
  editor: ['base.read', 'row.create', 'row.update', 'view.create', 'view.update', 'automation.run'],
  viewer: ['base.read', 'view.create'],
};

export const CUSTOM_ROLE_CAPABILITY_LABELS: Record<CustomRoleCapability, string> = {
  'base.read': '查看 base',
  'base.write': '编辑 base',
  'base.delete': '删除 base',
  'field.create': '创建字段',
  'field.update': '更新字段',
  'field.delete': '删除字段',
  'row.create': '创建行',
  'row.update': '更新行',
  'row.delete': '删除行',
  'view.create': '创建视图',
  'view.update': '更新视图',
  'view.delete': '删除视图',
  'automation.run': '运行自动化',
  'automation.edit': '编辑自动化',
  'share.create': '创建分享',
  'invite.user': '邀请用户',
  'webhook.manage': '管理 Webhook',
  'api-token.manage': '管理 API Token',
};
