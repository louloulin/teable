import { ViewPermissionService } from './view-permission.service';
import { vi } from 'vitest';

interface MockStore {
  viewPermission: {
    findMany: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

const buildPrisma = (): MockStore => ({
  viewPermission: {
    findMany: vi.fn(async () => []),
    upsert: vi.fn(async ({ where, create, update }) => ({
      id: create.id,
      viewId: where.viewId_subjectKind_subjectId.viewId,
      subjectKind: where.viewId_subjectKind_subjectId.subjectKind,
      subjectId: where.viewId_subjectKind_subjectId.subjectId,
      permission: update.permission ?? create.permission,
      createdTime: new Date(),
    })),
    delete: vi.fn(async () => undefined),
  },
});

describe('ViewPermissionService (Stage 17)', () => {
  let svc: ViewPermissionService;
  let store: MockStore;

  beforeEach(() => {
    store = buildPrisma();
    svc = new ViewPermissionService(store as never);
  });

  it('list delegates to findMany with the right where', async () => {
    store.viewPermission.findMany.mockResolvedValueOnce([
      {
        id: 'vp_1',
        viewId: 'view_1',
        subjectKind: 'user',
        subjectId: 'u1',
        permission: 'read',
        createdTime: new Date(),
      },
    ]);
    const rows = await svc.list('view_1');
    expect(rows).toHaveLength(1);
    expect(store.viewPermission.findMany).toHaveBeenCalledWith({ where: { viewId: 'view_1' } });
  });

  it('grant rejects invalid permission strings', async () => {
    await expect(
      svc.grant('view_1', { subjectKind: 'user', subjectId: 'u1', permission: 'admin' as never })
    ).rejects.toThrow(/invalid permission/);
  });

  it('grant rejects invalid subject_kind', async () => {
    await expect(
      svc.grant('view_1', { subjectKind: 'org' as never, subjectId: 'u1', permission: 'read' })
    ).rejects.toThrow(/invalid subject_kind/);
  });

  it('grant upserts and returns the row', async () => {
    const row = await svc.grant('view_1', {
      subjectKind: 'user',
      subjectId: 'u1',
      permission: 'write',
    });
    expect(row.permission).toBe('write');
    expect(store.viewPermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          viewId_subjectKind_subjectId: {
            viewId: 'view_1',
            subjectKind: 'user',
            subjectId: 'u1',
          },
        },
      })
    );
  });

  it('revoke returns false when the row is absent', async () => {
    store.viewPermission.delete.mockRejectedValueOnce(new Error('not found'));
    const ok = await svc.revoke('view_1', 'user', 'u1');
    expect(ok).toBe(false);
  });

  it('revoke returns true on success', async () => {
    const ok = await svc.revoke('view_1', 'user', 'u1');
    expect(ok).toBe(true);
  });

  it('resolve returns owner for the view creator without consulting DB', async () => {
    const r = await svc.resolve({
      viewId: 'view_1',
      viewCreatorId: 'u_owner',
      userId: 'u_owner',
      roleIds: [],
    });
    expect(r).toBe('owner');
    expect(store.viewPermission.findMany).not.toHaveBeenCalled();
  });

  it('resolve returns denied when there are no rules', async () => {
    store.viewPermission.findMany.mockResolvedValueOnce([]);
    const r = await svc.resolve({
      viewId: 'view_1',
      viewCreatorId: 'u_owner',
      userId: 'u_other',
      roleIds: [],
    });
    expect(r).toBe('denied');
  });

  it('resolve picks the highest of user+role grants', async () => {
    store.viewPermission.findMany.mockResolvedValueOnce([
      {
        id: '1',
        viewId: 'v',
        subjectKind: 'role',
        subjectId: 'r_writer',
        permission: 'write',
        createdTime: new Date(),
      },
      {
        id: '2',
        viewId: 'v',
        subjectKind: 'user',
        subjectId: 'u1',
        permission: 'read',
        createdTime: new Date(),
      },
    ]);
    const r = await svc.resolve({
      viewId: 'v',
      viewCreatorId: 'owner',
      userId: 'u1',
      roleIds: ['r_writer'],
    });
    expect(r).toBe('write');
  });

  it('explicit user-denied wins over role grants', async () => {
    store.viewPermission.findMany.mockResolvedValueOnce([
      {
        id: '1',
        viewId: 'v',
        subjectKind: 'role',
        subjectId: 'r_admin',
        permission: 'owner',
        createdTime: new Date(),
      },
      {
        id: '2',
        viewId: 'v',
        subjectKind: 'user',
        subjectId: 'u1',
        permission: 'denied',
        createdTime: new Date(),
      },
    ]);
    const r = await svc.resolve({
      viewId: 'v',
      viewCreatorId: 'someone',
      userId: 'u1',
      roleIds: ['r_admin'],
    });
    expect(r).toBe('denied');
  });

  it('assertAtLeast throws when below threshold', async () => {
    store.viewPermission.findMany.mockResolvedValueOnce([
      {
        id: '1',
        viewId: 'v',
        subjectKind: 'user',
        subjectId: 'u1',
        permission: 'read',
        createdTime: new Date(),
      },
    ]);
    await expect(
      svc.assertAtLeast(
        { viewId: 'v', viewCreatorId: 'someone', userId: 'u1', roleIds: [] },
        'write'
      )
    ).rejects.toThrow(/view permission denied/);
  });

  it('assertAtLeast does not throw when at threshold', async () => {
    store.viewPermission.findMany.mockResolvedValueOnce([
      {
        id: '1',
        viewId: 'v',
        subjectKind: 'user',
        subjectId: 'u1',
        permission: 'write',
        createdTime: new Date(),
      },
    ]);
    await expect(
      svc.assertAtLeast(
        { viewId: 'v', viewCreatorId: 'someone', userId: 'u1', roleIds: [] },
        'write'
      )
    ).resolves.toBeUndefined();
  });
});
