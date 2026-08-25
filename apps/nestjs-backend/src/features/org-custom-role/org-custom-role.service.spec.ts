import {
  applicableScopes,
  canRegisterMore,
  decideAccess,
  isBuiltInRole,
  isCapability,
  isScopeKind,
  maxCaps,
  maxRoles,
  maxScopes,
  normalizeRole,
  resolveInherited,
  roleAppliesToBase,
  roleGrants,
  validateAssignment,
  validateRole,
  validateScope,
} from './org-custom-role.service';
import type {
  BuiltInRole,
  CustomRoleCapability,
  ICustomRole,
  IRoleAssignment,
  IRoleScope,
} from './org-custom-role.types';
import {
  BUILT_IN_ROLE_CAPABILITIES,
  MAX_CAPABILITIES_PER_ROLE,
  MAX_CUSTOM_ROLES_PER_ORG,
  MAX_NAME_LENGTH,
  MAX_SCOPES_PER_ROLE,
} from './org-custom-role.types';

const baseRole = (over: Partial<ICustomRole> = {}): ICustomRole => ({
  id: 'role1',
  orgId: 'org1',
  name: 'data-entry',
  description: 'data entry only',
  capabilities: ['base.read', 'row.create', 'row.update'],
  scopes: [],
  enabled: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('org-custom-role.isCapability', () => {
  it('accepts canonical', () => {
    expect(isCapability('base.read')).toBe(true);
    expect(isCapability('row.create')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isCapability('base.nuke')).toBe(false);
  });
});

describe('org-custom-role.isScopeKind', () => {
  it('accepts view/field/row', () => {
    expect(isScopeKind('view')).toBe(true);
    expect(isScopeKind('field')).toBe(true);
    expect(isScopeKind('row')).toBe(true);
  });
  it('rejects unknown', () => {
    expect(isScopeKind('table')).toBe(false);
  });
});

describe('org-custom-role.isBuiltInRole', () => {
  it('accepts admin/builder/editor/viewer', () => {
    expect(isBuiltInRole('admin')).toBe(true);
    expect(isBuiltInRole('viewer')).toBe(true);
  });
  it('rejects custom ids', () => {
    expect(isBuiltInRole('data-entry')).toBe(false);
  });
});

describe('org-custom-role.maxRoles', () => {
  it('returns default', () => {
    expect(maxRoles()).toBe(MAX_CUSTOM_ROLES_PER_ORG);
  });
  it('honors option', () => {
    expect(maxRoles({ maxCustomRoles: 4 })).toBe(4);
  });
});

describe('org-custom-role.maxCaps / maxScopes', () => {
  it('returns defaults', () => {
    expect(maxCaps()).toBe(MAX_CAPABILITIES_PER_ROLE);
    expect(maxScopes()).toBe(MAX_SCOPES_PER_ROLE);
  });
});

describe('org-custom-role.validateScope', () => {
  it('passes view scope', () => {
    expect(validateScope({ kind: 'view', resourceId: 'v1' })).toBeNull();
  });
  it('requires filter for row scope', () => {
    expect(validateScope({ kind: 'row', resourceId: 'all' })).toContain('filter');
  });
  it('rejects unknown kind', () => {
    expect(validateScope({ kind: 'table' as never, resourceId: 't1' })).toContain('kind');
  });
  it('rejects missing resourceId', () => {
    expect(validateScope({ kind: 'view', resourceId: '' })).toContain('resourceId');
  });
});

describe('org-custom-role.validateRole', () => {
  it('passes a healthy role', () => {
    expect(validateRole(baseRole())).toBeNull();
  });
  it('rejects empty name', () => {
    expect(validateRole(baseRole({ name: '' }))).toContain('name');
  });
  it('rejects overlong name', () => {
    expect(validateRole(baseRole({ name: 'x'.repeat(MAX_NAME_LENGTH + 1) }))).toContain('name');
  });
  it('rejects too many caps', () => {
    const tooMany: CustomRoleCapability[] = Array.from(
      { length: MAX_CAPABILITIES_PER_ROLE + 1 },
      () => 'base.read'
    );
    expect(validateRole(baseRole({ capabilities: tooMany }))).toContain('capabilities');
  });
  it('rejects too many scopes', () => {
    const tooMany: IRoleScope[] = Array.from({ length: MAX_SCOPES_PER_ROLE + 1 }, () => ({
      kind: 'view',
      resourceId: 'v1',
    }));
    expect(validateRole(baseRole({ scopes: tooMany }))).toContain('scopes');
  });
  it('rejects unknown capability', () => {
    expect(validateRole(baseRole({ capabilities: ['base.nuke' as never] }))).toContain(
      'capability'
    );
  });
  it('rejects missing id/orgId', () => {
    expect(validateRole(baseRole({ id: '' }))).toContain('id');
    expect(validateRole(baseRole({ orgId: '' }))).toContain('orgId');
  });
});

describe('org-custom-role.normalizeRole', () => {
  it('dedupes capabilities and drops invalid scopes', () => {
    const role = normalizeRole({
      id: 'r1',
      orgId: 'o1',
      name: 'r',
      capabilities: ['base.read', 'base.read', 'bogus' as never],
      scopes: [
        { kind: 'view', resourceId: 'v1' },
        { kind: 'row', resourceId: 'all' }, // missing filter → dropped
      ],
    });
    expect(role.capabilities).toEqual(['base.read']);
    expect(role.scopes.length).toBe(1);
    expect(role.enabled).toBe(true);
  });
});

describe('org-custom-role.canRegisterMore', () => {
  it('allows under cap', () => {
    expect(canRegisterMore(MAX_CUSTOM_ROLES_PER_ORG - 1)).toBe(true);
  });
  it('blocks at cap', () => {
    expect(canRegisterMore(MAX_CUSTOM_ROLES_PER_ORG)).toBe(false);
  });
  it('honors option', () => {
    expect(canRegisterMore(3, { maxCustomRoles: 4 })).toBe(true);
    expect(canRegisterMore(4, { maxCustomRoles: 4 })).toBe(false);
  });
});

describe('org-custom-role.validateAssignment', () => {
  it('passes a healthy assignment', () => {
    expect(
      validateAssignment({
        id: 'a1',
        orgId: 'o1',
        userId: 'u1',
        roleId: 'admin',
        baseId: null,
        grantedAt: '',
        grantedBy: 'admin',
      })
    ).toBeNull();
  });
  it('rejects missing fields', () => {
    const base: IRoleAssignment = {
      id: 'a1',
      orgId: 'o1',
      userId: 'u1',
      roleId: 'admin',
      baseId: null,
      grantedAt: '',
      grantedBy: 'admin',
    };
    expect(validateAssignment({ ...base, id: '' })).toContain('id');
    expect(validateAssignment({ ...base, orgId: '' })).toContain('orgId');
    expect(validateAssignment({ ...base, userId: '' })).toContain('userId');
    expect(validateAssignment({ ...base, roleId: '' })).toContain('roleId');
    expect(validateAssignment({ ...base, grantedBy: '' })).toContain('grantedBy');
  });
});

describe('org-custom-role.roleGrants', () => {
  it('grants when capability present and enabled', () => {
    expect(roleGrants(baseRole(), 'base.read')).toBe(true);
  });
  it('denies when disabled', () => {
    expect(roleGrants(baseRole({ enabled: false }), 'base.read')).toBe(false);
  });
  it('denies when capability missing', () => {
    expect(roleGrants(baseRole(), 'base.delete')).toBe(false);
  });
});

describe('org-custom-role.roleAppliesToBase', () => {
  it('returns true when enabled', () => {
    expect(roleAppliesToBase(baseRole(), 'b1')).toBe(true);
  });
  it('returns false when disabled', () => {
    expect(roleAppliesToBase(baseRole({ enabled: false }), 'b1')).toBe(false);
  });
});

describe('org-custom-role.resolveInherited', () => {
  it('unions built-in and custom caps', () => {
    const caps = resolveInherited({ builtIn: 'editor', custom: baseRole() });
    expect(caps).toContain('base.read');
    expect(caps).toContain('row.create');
    expect(caps).toContain('row.update');
  });
  it('returns only built-in when no custom', () => {
    const caps = resolveInherited({ builtIn: 'admin' });
    expect(caps.length).toBe(BUILT_IN_ROLE_CAPABILITIES.admin.length);
  });
  it('skips disabled custom', () => {
    const caps = resolveInherited({
      builtIn: 'viewer',
      custom: baseRole({ enabled: false }),
    });
    expect(caps).not.toContain('row.create');
  });
});

describe('org-custom-role.applicableScopes', () => {
  it('returns matching scopes', () => {
    const role = baseRole({
      scopes: [
        { kind: 'view', resourceId: 'v1' },
        { kind: 'field', resourceId: 'f1' },
      ],
    });
    const out = applicableScopes({
      role,
      requested: [
        { kind: 'view', resourceId: 'v1' },
        { kind: 'field', resourceId: 'f2' },
      ],
    });
    expect(out.length).toBe(1);
    expect(out[0]?.resourceId).toBe('v1');
  });
  it('returns empty when role disabled', () => {
    const role = baseRole({ enabled: false, scopes: [{ kind: 'view', resourceId: 'v1' }] });
    expect(applicableScopes({ role, requested: [{ kind: 'view', resourceId: 'v1' }] })).toEqual([]);
  });
});

describe('org-custom-role.decideAccess', () => {
  it('allows when built-in role grants capability', () => {
    const r = decideAccess({
      assignments: [
        {
          id: 'a1',
          orgId: 'o1',
          userId: 'u1',
          roleId: 'admin' as BuiltInRole,
          baseId: null,
          grantedAt: '',
          grantedBy: 'sys',
        },
      ],
      roles: [],
      userId: 'u1',
      baseId: 'b1',
      capability: 'base.delete',
    });
    expect(r.allow).toBe(true);
    expect(r.reasons[0]).toContain('built-in:admin');
  });
  it('allows when custom role grants capability', () => {
    const r = decideAccess({
      assignments: [
        {
          id: 'a1',
          orgId: 'o1',
          userId: 'u1',
          roleId: 'role1',
          baseId: 'b1',
          grantedAt: '',
          grantedBy: 'sys',
        },
      ],
      roles: [baseRole()],
      userId: 'u1',
      baseId: 'b1',
      capability: 'row.create',
    });
    expect(r.allow).toBe(true);
    expect(r.reasons[0]).toContain('custom:role1');
  });
  it('denies when assignment is for a different base', () => {
    const r = decideAccess({
      assignments: [
        {
          id: 'a1',
          orgId: 'o1',
          userId: 'u1',
          roleId: 'role1',
          baseId: 'b2',
          grantedAt: '',
          grantedBy: 'sys',
        },
      ],
      roles: [baseRole()],
      userId: 'u1',
      baseId: 'b1',
      capability: 'row.create',
    });
    expect(r.allow).toBe(false);
  });
  it('denies when capability missing', () => {
    const r = decideAccess({
      assignments: [
        {
          id: 'a1',
          orgId: 'o1',
          userId: 'u1',
          roleId: 'viewer' as BuiltInRole,
          baseId: null,
          grantedAt: '',
          grantedBy: 'sys',
        },
      ],
      roles: [],
      userId: 'u1',
      baseId: 'b1',
      capability: 'base.delete',
    });
    expect(r.allow).toBe(false);
  });
});
