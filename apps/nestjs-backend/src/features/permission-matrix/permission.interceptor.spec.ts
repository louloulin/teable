import { PermissionMatrixService } from './permission-matrix.service';
import { PermissionInterceptor } from './permission.interceptor';
import { IPermissionRoleVo } from './permission-matrix.constants';

const matrix = (overrides: Partial<PermissionMatrixService> = {}): PermissionMatrixService => {
  const fake = {
    resolveRolesForUser: jest.fn(async () => []),
    fieldAccess: jest.fn(() => 'unset' as const),
    mergeRecordFilters: jest.fn(() => null),
    applyCurrentUser: jest.fn((filter: unknown) => filter),
    ...overrides,
  };
  return fake as unknown as PermissionMatrixService;
};

const cls = (user?: { id: string }) =>
  ({
    get: (key: string) => (key === 'user' ? user : undefined),
  }) as never;

const execCtx = (req: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
  }) as never;

describe('PermissionInterceptor.response projection', () => {
  it('projects hidden fields to null in record envelopes', async () => {
    const m = matrix({
      resolveRolesForUser: jest.fn(
        async () => [{ nodes: [], recordActions: [], fieldPermissions: [] }] as IPermissionRoleVo[]
      ),
      fieldAccess: jest.fn((_r, _t, fid: string) =>
        fid === 'secret' ? ('hidden' as const) : ('editable' as const)
      ),
    });

    const interceptor = new PermissionInterceptor(m, cls({ id: 'u1' }));

    // Use the public projection helper via direct method call.
    const projected = (
      interceptor as unknown as {
        projectResponse: (b: unknown, r: IPermissionRoleVo[], t: string) => unknown;
      }
    ).projectResponse(
      {
        records: [
          { id: 'r1', fields: { name: 'alice', secret: 'leak' } },
          { id: 'r2', fields: { name: 'bob', secret: 'leak2' } },
        ],
      },
      [{ nodes: [], recordActions: [], fieldPermissions: [] } as IPermissionRoleVo],
      't1'
    ) as { records: Array<{ fields: Record<string, unknown> }> };

    expect(projected.records[0].fields.name).toBe('alice');
    expect(projected.records[0].fields.secret).toBeNull();
    expect(projected.records[1].fields.secret).toBeNull();
  });

  it('passes through rows when no roles apply', () => {
    const m = matrix();
    const interceptor = new PermissionInterceptor(m, cls({ id: 'u1' }));
    const projected = (
      interceptor as unknown as {
        projectResponse: (b: unknown, r: IPermissionRoleVo[], t: string) => unknown;
      }
    ).projectResponse({ records: [{ id: 'r1', fields: { name: 'alice' } }] }, [], 't1');
    expect(projected).toEqual({ records: [{ id: 'r1', fields: { name: 'alice' } }] });
  });

  it('handles bare rows (no `fields` envelope)', () => {
    const m = matrix({
      fieldAccess: jest.fn(() => 'hidden' as const),
    });
    const interceptor = new PermissionInterceptor(m, cls({ id: 'u1' }));
    const projected = (
      interceptor as unknown as {
        projectResponse: (b: unknown, r: IPermissionRoleVo[], t: string) => unknown;
      }
    ).projectResponse({ name: 'alice', secret: 'leak' }, [], 't1') as Record<string, unknown>;
    expect(projected.secret).toBeNull();
    expect(projected.name).toBe('alice');
  });
});

describe('PermissionInterceptor.stashFilterOnReq (static helper)', () => {
  it('writes the supplied filter under req.permission.filter', () => {
    const req: Record<string, unknown> = {};
    const filter = { conjunction: 'and', items: [{ field: 'owner', operator: 'is', value: 'u1' }] };
    PermissionInterceptor.stashFilterOnReq(req, filter);
    expect((req.permission as { filter: unknown }).filter).toBe(filter);
  });

  it('writes null when no filter applies', () => {
    const req: Record<string, unknown> = {};
    PermissionInterceptor.stashFilterOnReq(req, null);
    expect((req.permission as { filter: unknown }).filter).toBeNull();
  });
});
