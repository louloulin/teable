import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionMatrixService } from './permission-matrix.service';
import {
  CURRENT_USER_SENTINEL,
  type IPermissionRoleVo,
} from './permission-matrix.constants';

describe('PermissionMatrixService.applyCurrentUser', () => {
  const svc = new PermissionMatrixService({} as never, {} as never);

  it('substitutes $current_user inside nested filter values', () => {
    const filter = {
      conjunction: 'and',
      items: [
        { field: 'sales_owner', operator: 'is', value: CURRENT_USER_SENTINEL },
        { field: 'status', operator: 'is', value: 'open' },
      ],
    };
    const out = svc.applyCurrentUser(filter, 'user_42') as {
      items: Array<{ value: unknown }>;
    };
    expect(out.items[0].value).toBe('user_42');
    expect(out.items[1].value).toBe('open');
  });

  it('returns the original filter unchanged when no $current_user present', () => {
    const filter = { field: 'status', operator: 'is', value: 'open' };
    const out = svc.applyCurrentUser(filter, 'user_42');
    expect(out).toEqual(filter);
  });

  it('does not mutate the cached filter object', () => {
    const filter = {
      conjunction: 'and',
      items: [{ field: 'owner', operator: 'is', value: CURRENT_USER_SENTINEL }],
    };
    const before = JSON.stringify(filter);
    svc.applyCurrentUser(filter, 'user_x');
    expect(JSON.stringify(filter)).toBe(before);
  });

  it('handles arrays under arbitrary keys', () => {
    const filter = {
      not: [{ field: 'owner', value: CURRENT_USER_SENTINEL }],
    };
    const out = svc.applyCurrentUser(filter, 'u_1') as {
      not: Array<{ value: unknown }>;
    };
    expect(out.not[0].value).toBe('u_1');
  });
});

describe('PermissionMatrixService mergeRecordFilters', () => {
  const svc = new PermissionMatrixService({} as never, {} as never);

  it('returns null when no role declares a filter', () => {
    expect(svc.mergeRecordFilters([], 't1')).toBeNull();
  });

  it('returns the single filter unchanged when one role declares', () => {
    const f = { field: 'x', value: 1 };
    expect(svc.mergeRecordFilters([{ recordFilter: { tableId: 't1', filter: f } } as never], 't1')).toBe(
      f
    );
  });

  it('AND-combines filters across roles per the guide', () => {
    const f1 = { field: 'a', value: 1 };
    const f2 = { field: 'b', value: 2 };
    const out = svc.mergeRecordFilters(
      [
        { recordFilter: { tableId: 't1', filter: f1 } } as never,
        { recordFilter: { tableId: 't1', filter: f2 } } as never,
      ],
      't1'
    ) as { conjunction: string; filterSet: unknown[] };
    expect(out.conjunction).toBe('and');
    expect(out.filterSet).toEqual([f1, f2]);
  });
});

describe('PermissionMatrixService fieldAccess union', () => {
  const svc = new PermissionMatrixService({} as never, {} as never);

  const editableRole = {
    nodes: [{ tableId: 't1', access: 'editable' }],
    recordActions: [{ tableId: 't1', action: 'view' }],
    fieldPermissions: [{ tableId: 't1', fieldId: 'f1', access: 'editable' }],
  } as never;

  const readonlyRole = {
    nodes: [{ tableId: 't1', access: 'editable' }],
    recordActions: [{ tableId: 't1', action: 'view' }],
    fieldPermissions: [{ tableId: 't1', fieldId: 'f1', access: 'readonly' }],
  } as never;

  const hiddenRole = {
    nodes: [{ tableId: 't1', access: 'editable' }],
    recordActions: [{ tableId: 't1', action: 'view' }],
    fieldPermissions: [{ tableId: 't1', fieldId: 'f1', access: 'hidden' }],
  } as never;

  it('returns unset when no role mentions the field', () => {
    expect(svc.fieldAccess([], 't1', 'f1')).toBe('unset');
  });

  it('returns hidden when any role hides the field', () => {
    expect(svc.fieldAccess([editableRole, hiddenRole], 't1', 'f1')).toBe('hidden');
  });

  it('returns editable when at least one role allows edit and none hides', () => {
    expect(svc.fieldAccess([readonlyRole, editableRole], 't1', 'f1')).toBe('editable');
  });

  it('returns readonly when only readonly granted', () => {
    expect(svc.fieldAccess([readonlyRole], 't1', 'f1')).toBe('readonly');
  });
});

describe('PermissionMatrixService.resolveViewAccessForUser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const baseRole: IPermissionRoleVo = {
    id: 'r1',
    baseId: 'b1',
    name: 'role',
    description: null,
    status: 'enabled',
    members: [],
    nodes: [],
    fieldPermissions: [],
    recordActions: [],
    recordFilter: null,
  };

  it('returns true when user has no roles (admins fall through)', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([]);
    await expect(svc.resolveViewAccessForUser('b1', 'u1', 't1', 'v1')).resolves.toBe(true);
  });

  it('returns true when a role grants the view action on the table', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([
      { ...baseRole, recordActions: [{ tableId: 't1', action: 'view' }] },
    ]);
    await expect(svc.resolveViewAccessForUser('b1', 'u1', 't1', 'v1')).resolves.toBe(true);
  });

  it('returns true when no view restrictions are configured (default = all views)', async () => {
    // R-PERM-2 follow-up — the help guide says "可以查看 所有视图 还是只能查看
    // 特定视图". When a role has the table at 可编辑 but no explicit
    // viewPermissions entry, the user should see every view by default.
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([{ ...baseRole, recordActions: [] }]);
    await expect(svc.resolveViewAccessForUser('b1', 'u1', 't1', 'v1')).resolves.toBe(true);
  });

  it('returns true when role grants view-all (viewId: null) on the table', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([
      {
        ...baseRole,
        recordActions: [],
        viewPermissions: [{ tableId: 't1', viewId: null }],
      },
    ]);
    await expect(svc.resolveViewAccessForUser('b1', 'u1', 't1', 'v2')).resolves.toBe(true);
  });

  it('returns true when role allows exactly the requested view', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([
      {
        ...baseRole,
        recordActions: [],
        viewPermissions: [{ tableId: 't1', viewId: 'v1' }],
      },
    ]);
    await expect(svc.resolveViewAccessForUser('b1', 'u1', 't1', 'v1')).resolves.toBe(true);
  });

  it('returns false when role allows only a different view', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([
      {
        ...baseRole,
        recordActions: [{ tableId: 't1', action: 'view' }],
        viewPermissions: [{ tableId: 't1', viewId: 'v1' }],
      },
    ]);
    // record-action grants view but the explicit allow-list does not include v2.
    await expect(svc.resolveViewAccessForUser('b1', 'u1', 't1', 'v2')).resolves.toBe(false);
  });

  it('treats viewPermissions on a different table as no restriction', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([
      {
        ...baseRole,
        recordActions: [{ tableId: 't1', action: 'view' }],
        viewPermissions: [{ tableId: 'other-table', viewId: 'v1' }],
      },
    ]);
    await expect(svc.resolveViewAccessForUser('b1', 'u1', 't1', 'v9')).resolves.toBe(true);
  });
});

describe('PermissionMatrixService.resolveViewsAccessibleForUser', () => {
  const baseRole: IPermissionRoleVo = {
    id: 'r1',
    baseId: 'b1',
    name: 'role',
    description: null,
    status: 'enabled',
    members: [],
    nodes: [],
    fieldPermissions: [],
    recordActions: [],
    recordFilter: null,
  };

  it('returns null (admin sees all) when user has no roles', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([]);
    await expect(svc.resolveViewsAccessibleForUser('b1', 'u1', 't1')).resolves.toBeNull();
  });

  it('returns null when any role has no viewPermissions entries on the table', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([
      { ...baseRole, viewPermissions: [{ tableId: 'other-table', viewId: 'v1' }] },
    ]);
    await expect(svc.resolveViewsAccessibleForUser('b1', 'u1', 't1')).resolves.toBeNull();
  });

  it('returns null when any role grants view-all (viewId: null)', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([
      { ...baseRole, viewPermissions: [{ tableId: 't1', viewId: null }] },
      { ...baseRole, viewPermissions: [{ tableId: 't1', viewId: 'v1' }] },
    ]);
    await expect(svc.resolveViewsAccessibleForUser('b1', 'u1', 't1')).resolves.toBeNull();
  });

  it('returns the union of explicit view IDs across all roles', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([
      { ...baseRole, viewPermissions: [{ tableId: 't1', viewId: 'v1' }] },
      { ...baseRole, viewPermissions: [{ tableId: 't1', viewId: 'v2' }] },
      { ...baseRole, viewPermissions: [{ tableId: 't1', viewId: 'v1' }] },
    ]);
    await expect(svc.resolveViewsAccessibleForUser('b1', 'u1', 't1')).resolves.toStrictEqual([
      'v1',
      'v2',
    ]);
  });

  it('returns an empty array when restrictions exist but no view is allowed', async () => {
    const svc = new PermissionMatrixService({} as never, {} as never);
    vi.spyOn(svc, 'resolveRolesForUser').mockResolvedValue([
      {
        ...baseRole,
        viewPermissions: [{ tableId: 't1', viewId: 'v-foo' }],
      },
    ]);
    // The view-restricted user sees nothing on t1 (no overlap).
    await expect(svc.resolveViewsAccessibleForUser('b1', 'u1', 't1')).resolves.toStrictEqual([
      'v-foo',
    ]);
  });

});
