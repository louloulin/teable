import { applyPermissionFilter } from './permission-filter-merge';

describe('applyPermissionFilter — Stage 5b', () => {
  it('returns where unchanged when req.permission is absent', () => {
    const where = { field1: 'value1' };
    expect(applyPermissionFilter(undefined, where)).toBe(where);
  });

  it('returns where unchanged when filter is null', () => {
    const where = { field1: 'value1' };
    expect(applyPermissionFilter({ permission: { filter: null } }, where)).toBe(where);
  });

  it('returns where unchanged when filter is empty object', () => {
    const where = { field1: 'value1' };
    expect(applyPermissionFilter({ permission: { filter: {} } }, where)).toBe(where);
  });

  it('AND-merges filter with where when filter is present', () => {
    const where = { priority: 'high' };
    const out = applyPermissionFilter(
      { permission: { filter: { assignedTo: 'me' } } },
      where
    );
    expect(out).toEqual({ AND: [{ priority: 'high' }, { assignedTo: 'me' }] });
  });

  it('does NOT mutate the original where object', () => {
    const where = { field1: 'a' };
    applyPermissionFilter({ permission: { filter: { x: 1 } } }, where);
    expect(where).toEqual({ field1: 'a' });
  });

  it('combines with complex where clauses (Prisma orderBy / take untouched)', () => {
    const where = { OR: [{ status: 'open' }, { status: 'pending' }] };
    const out = applyPermissionFilter(
      { permission: { filter: { ownerId: 'u_1' } } },
      where
    );
    expect(out).toEqual({
      AND: [{ OR: [{ status: 'open' }, { status: 'pending' }] }, { ownerId: 'u_1' }],
    });
  });

  it('is a narrowing AND — filter cannot widen a where', () => {
    const where = { visible: true };
    const out = applyPermissionFilter(
      { permission: { filter: { hidden: false } } },
      where
    );
    // The filter `hidden: false` cannot widen the `visible: true` constraint.
    expect(out).toEqual({ AND: [{ visible: true }, { hidden: false }] });
  });
});