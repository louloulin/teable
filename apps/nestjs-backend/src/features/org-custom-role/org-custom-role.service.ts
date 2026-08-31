/**
 * Org-level custom roles — pure helpers (Stage 70).
 */

import type {
  BuiltInRole,
  CustomRoleCapability,
  ICustomRole,
  IOrgCustomRoleOptions,
  IRoleAssignment,
  IRoleScope,
  RoleScopeKind,
} from './org-custom-role.types';
import {
  BUILT_IN_ROLE_CAPABILITIES,
  MAX_CAPABILITIES_PER_ROLE,
  MAX_CUSTOM_ROLES_PER_ORG,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  MAX_SCOPES_PER_ROLE,
} from './org-custom-role.types';

const ALL_CAPABILITIES: ReadonlyArray<CustomRoleCapability> = [
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
];

const ALL_SCOPE_KINDS: ReadonlyArray<RoleScopeKind> = ['view', 'field', 'row'];

const ALL_BUILTIN: ReadonlyArray<BuiltInRole> = ['admin', 'builder', 'editor', 'viewer'];

/** Whether the input is a recognized capability string. */
export function isCapability(s: string): s is CustomRoleCapability {
  return (ALL_CAPABILITIES as ReadonlyArray<string>).includes(s);
}

/** Whether the input is a recognized scope kind. */
export function isScopeKind(s: string): s is RoleScopeKind {
  return (ALL_SCOPE_KINDS as ReadonlyArray<string>).includes(s);
}

/** Whether the input is a built-in role. */
export function isBuiltInRole(s: string): s is BuiltInRole {
  return (ALL_BUILTIN as ReadonlyArray<string>).includes(s);
}

/** Resolve the effective max role count from options. */
export function maxRoles(opts?: IOrgCustomRoleOptions): number {
  return opts?.maxCustomRoles ?? MAX_CUSTOM_ROLES_PER_ORG;
}

/** Resolve the effective max capability count. */
export function maxCaps(opts?: IOrgCustomRoleOptions): number {
  return opts?.maxCapabilities ?? MAX_CAPABILITIES_PER_ROLE;
}

/** Resolve the effective max scope count. */
export function maxScopes(opts?: IOrgCustomRoleOptions): number {
  return opts?.maxScopes ?? MAX_SCOPES_PER_ROLE;
}

/** Validate a scope entry. */
export function validateScope(scope: IRoleScope): string | null {
  if (!isScopeKind(scope.kind)) return `unknown scope kind: ${scope.kind}`;
  if (!scope.resourceId) return 'resourceId required';
  if (scope.kind === 'row' && !scope.filter) {
    return 'row scope requires a filter expression';
  }
  return null;
}

/** Validate a role. Returns null if OK, or an error string. */
export function validateRole(role: ICustomRole, opts?: IOrgCustomRoleOptions): string | null {
  if (!role.id) return 'id required';
  if (!role.orgId) return 'orgId required';
  if (!role.name || role.name.length > MAX_NAME_LENGTH) {
    return `name length must be 1..${MAX_NAME_LENGTH}`;
  }
  if (role.description.length > MAX_DESCRIPTION_LENGTH) {
    return `description length must be ≤ ${MAX_DESCRIPTION_LENGTH}`;
  }
  if (role.capabilities.length > maxCaps(opts)) {
    return `too many capabilities (${role.capabilities.length} > ${maxCaps(opts)})`;
  }
  if (role.scopes.length > maxScopes(opts)) {
    return `too many scopes (${role.scopes.length} > ${maxScopes(opts)})`;
  }
  for (const c of role.capabilities) {
    if (!isCapability(c)) return `unknown capability: ${c}`;
  }
  for (const s of role.scopes) {
    const err = validateScope(s);
    if (err) return err;
  }
  return null;
}

/** Normalize a role — dedupe capabilities, ensure timestamps. */
export function normalizeRole(
  input: Partial<ICustomRole> & { id: string; orgId: string; name: string },
  now?: string
): ICustomRole {
  const nowIso = now ?? new Date().toISOString();
  const caps = Array.from(new Set(input.capabilities ?? [])).filter(isCapability);
  const scopes = (input.scopes ?? []).filter((s) => validateScope(s) === null);
  return {
    id: input.id,
    orgId: input.orgId,
    name: input.name,
    description: input.description ?? '',
    capabilities: caps,
    scopes,
    enabled: input.enabled ?? true,
    createdAt: input.createdAt ?? nowIso,
    updatedAt: input.updatedAt ?? nowIso,
  };
}

/** Whether the org can register another role. */
export function canRegisterMore(currentCount: number, opts?: IOrgCustomRoleOptions): boolean {
  return currentCount < maxRoles(opts);
}

/** Normalize an assignment — ensure grantedAt timestamp, baseId null/undefined handling. */
export function normalizeAssignment(
  input: {
    id: string;
    orgId: string;
    userId: string;
    roleId: string;
    baseId?: string | null;
    grantedBy: string;
  },
  now?: string
): IRoleAssignment {
  return {
    id: input.id,
    orgId: input.orgId,
    userId: input.userId,
    roleId: input.roleId,
    baseId: input.baseId ?? null,
    grantedAt: now ?? new Date().toISOString(),
    grantedBy: input.grantedBy,
  };
}

/** Validate a role assignment. */
export function validateAssignment(a: IRoleAssignment): string | null {
  if (!a.id) return 'id required';
  if (!a.orgId) return 'orgId required';
  if (!a.userId) return 'userId required';
  if (!a.roleId) return 'roleId required';
  if (!a.grantedBy) return 'grantedBy required';
  return null;
}

/** Whether the role grants the requested capability. */
export function roleGrants(role: ICustomRole, capability: CustomRoleCapability): boolean {
  return role.enabled && role.capabilities.includes(capability);
}

/** Whether the role applies to the given base (always true if no scope binding). */
export function roleAppliesToBase(role: ICustomRole, baseId: string): boolean {
  // Custom roles are org-wide; base-level narrowing happens via assignment.baseId.
  // The role itself does not constrain which base it can apply to.
  void baseId;
  return role.enabled;
}

/** Resolve the inherited capability set including a built-in baseline. */
export function resolveInherited(input: {
  builtIn?: BuiltInRole;
  custom?: ICustomRole;
}): CustomRoleCapability[] {
  const out = new Set<CustomRoleCapability>();
  if (input.builtIn) {
    for (const c of BUILT_IN_ROLE_CAPABILITIES[input.builtIn]) out.add(c);
  }
  if (input.custom?.enabled) {
    for (const c of input.custom.capabilities) out.add(c);
  }
  return Array.from(out);
}

/** Compute the intersection of scopes between a role and a request. */
export function applicableScopes(input: {
  role: ICustomRole;
  requested: IRoleScope[];
}): IRoleScope[] {
  if (!input.role.enabled) return [];
  const out: IRoleScope[] = [];
  for (const req of input.requested) {
    const matched = input.role.scopes.find(
      (s) => s.kind === req.kind && s.resourceId === req.resourceId
    );
    if (matched) out.push(matched);
  }
  return out;
}

/** Decide effective access for a (user, base, capability) tuple. */
export function decideAccess(input: {
  assignments: IRoleAssignment[];
  roles: ICustomRole[];
  userId: string;
  baseId: string;
  capability: CustomRoleCapability;
}): { allow: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let allow = false;
  for (const a of input.assignments) {
    if (a.userId !== input.userId) continue;
    if (a.baseId !== null && a.baseId !== input.baseId) continue;
    if (isBuiltInRole(a.roleId)) {
      const caps = BUILT_IN_ROLE_CAPABILITIES[a.roleId];
      if (caps.includes(input.capability)) {
        allow = true;
        reasons.push(`built-in:${a.roleId}`);
      }
      continue;
    }
    const role = input.roles.find((r) => r.id === a.roleId);
    if (role && roleGrants(role, input.capability)) {
      allow = true;
      reasons.push(`custom:${role.id}`);
    }
  }
  return { allow, reasons };
}

export const testHelpers = {
  ALL_CAPABILITIES,
  ALL_SCOPE_KINDS,
  ALL_BUILTIN,
};
