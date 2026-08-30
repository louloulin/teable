import { PermissionMatrixService } from './permission-matrix.service';
import { CURRENT_USER_SENTINEL } from './permission-matrix.constants';

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
