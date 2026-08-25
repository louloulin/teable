/**
 * NestJS auth service for org-custom-role — persistence is mocked.
 */

import { OrgCustomRoleAuthService } from './org-custom-role.auth.service';
import type { ICustomRole, IRoleAssignment } from './org-custom-role.types';

interface IPrismaMock {
  customRole: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown[]>;
    findUnique: (args: unknown) => Promise<unknown | null>;
    delete: (args: unknown) => Promise<unknown>;
  };
  roleAssignment: {
    upsert: (args: unknown) => Promise<unknown>;
    findMany: (args: unknown) => Promise<unknown[]>;
    delete: (args: unknown) => Promise<unknown>;
  };
}

function makePrisma(): IPrismaMock {
  return {
    customRole: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    roleAssignment: {
      upsert: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  };
}

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

const baseAssignment = (over: Partial<IRoleAssignment> = {}): IRoleAssignment => ({
  id: 'a1',
  orgId: 'org1',
  userId: 'u1',
  roleId: 'admin',
  baseId: null,
  grantedAt: '2026-01-01T00:00:00Z',
  grantedBy: 'sys',
  ...over,
});

describe('OrgCustomRoleAuthService.validate', () => {
  it('passes a healthy role', () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    expect(svc.validate(baseRole())).toBeNull();
  });
  it('rejects missing id', () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    expect(svc.validate(baseRole({ id: '' }))).toContain('id');
  });
});

describe('OrgCustomRoleAuthService.normalize', () => {
  it('dedupes capabilities', () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    const r = svc.normalize({
      id: 'r1',
      orgId: 'o1',
      name: 'r',
      capabilities: ['base.read', 'base.read', 'bogus' as never],
    });
    expect(r.capabilities).toEqual(['base.read']);
    expect(r.enabled).toBe(true);
  });
});

describe('OrgCustomRoleAuthService.canRegisterMore', () => {
  it('honors options', () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    expect(svc.canRegisterMore(3, { maxCustomRoles: 4 })).toBe(true);
    expect(svc.canRegisterMore(4, { maxCustomRoles: 4 })).toBe(false);
  });
});

describe('OrgCustomRoleAuthService.upsertRole', () => {
  it('persists via prisma upsert', async () => {
    const prisma = makePrisma();
    const svc = new OrgCustomRoleAuthService(prisma as never);
    await svc.upsertRole(baseRole());
    expect(prisma.customRole.upsert).toHaveBeenCalledTimes(1);
  });
  it('throws on invalid role', async () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    await expect(svc.upsertRole(baseRole({ name: '' }))).rejects.toThrow(/invalid role/);
  });
});

describe('OrgCustomRoleAuthService.listRoles', () => {
  it('returns parsed rows', async () => {
    const prisma = makePrisma();
    (prisma.customRole.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'r1',
        orgId: 'org1',
        name: 'data-entry',
        description: '',
        capabilities: ['base.read'],
        scopes: [],
        enabled: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const svc = new OrgCustomRoleAuthService(prisma as never);
    const rows = await svc.listRoles('org1');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('r1');
  });
});

describe('OrgCustomRoleAuthService.getRole', () => {
  it('returns null when missing', async () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    expect(await svc.getRole('missing')).toBeNull();
  });
});

describe('OrgCustomRoleAuthService.deleteRole', () => {
  it('delegates to prisma', async () => {
    const prisma = makePrisma();
    const svc = new OrgCustomRoleAuthService(prisma as never);
    await svc.deleteRole('r1');
    expect(prisma.customRole.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
  });
});

describe('OrgCustomRoleAuthService.validateAssignment', () => {
  it('passes healthy assignment', () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    expect(svc.validateAssignment(baseAssignment())).toBeNull();
  });
});

describe('OrgCustomRoleAuthService.upsertAssignment', () => {
  it('persists via prisma', async () => {
    const prisma = makePrisma();
    const svc = new OrgCustomRoleAuthService(prisma as never);
    await svc.upsertAssignment(baseAssignment());
    expect(prisma.roleAssignment.upsert).toHaveBeenCalledTimes(1);
  });
  it('throws on invalid', async () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    await expect(svc.upsertAssignment(baseAssignment({ id: '' }))).rejects.toThrow(
      /invalid assignment/
    );
  });
});

describe('OrgCustomRoleAuthService.listAssignmentsForUser', () => {
  it('returns parsed rows', async () => {
    const prisma = makePrisma();
    (prisma.roleAssignment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'a1',
        orgId: 'org1',
        userId: 'u1',
        roleId: 'admin',
        baseId: null,
        grantedAt: new Date('2026-01-01T00:00:00Z'),
        grantedBy: 'sys',
      },
    ]);
    const svc = new OrgCustomRoleAuthService(prisma as never);
    const rows = await svc.listAssignmentsForUser({ orgId: 'org1', userId: 'u1' });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.roleId).toBe('admin');
  });
});

describe('OrgCustomRoleAuthService.deleteAssignment', () => {
  it('delegates to prisma', async () => {
    const prisma = makePrisma();
    const svc = new OrgCustomRoleAuthService(prisma as never);
    await svc.deleteAssignment('a1');
    expect(prisma.roleAssignment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });
});

describe('OrgCustomRoleAuthService.decide', () => {
  it('allows when built-in admin grants', () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    const r = svc.decide({
      orgId: 'org1',
      userId: 'u1',
      baseId: 'b1',
      capability: 'base.delete',
      assignments: [baseAssignment({ roleId: 'admin' })],
      roles: [],
    });
    expect(r.allow).toBe(true);
  });
  it('filters by orgId', () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    const r = svc.decide({
      orgId: 'org1',
      userId: 'u1',
      baseId: 'b1',
      capability: 'base.delete',
      assignments: [baseAssignment({ orgId: 'other' })],
      roles: [],
    });
    expect(r.allow).toBe(false);
  });
});

describe('OrgCustomRoleAuthService.builtIns', () => {
  it('returns four built-in entries', () => {
    const svc = new OrgCustomRoleAuthService(makePrisma() as never);
    const keys = Object.keys(svc.builtIns()).sort();
    expect(keys).toEqual(['admin', 'builder', 'editor', 'viewer']);
  });
});
