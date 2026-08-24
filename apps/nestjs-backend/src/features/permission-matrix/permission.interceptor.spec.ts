import { PermissionMatrixService } from './permission-matrix.service';
import { PermissionInterceptor } from './permission.interceptor';
import { IPermissionRoleVo } from './permission-matrix.constants';

const matrix = (): PermissionMatrixService => {
  const fake = {
    resolveRolesForUser: jest.fn(async () => []),
    fieldAccess: jest.fn(() => 'unset' as const),
  };
  return fake as unknown as PermissionMatrixService;
};

const cls = (user?: { id: string }) =>
  ({
    get: (key: string) => (key === 'user' ? user : undefined),
  }) as never;

const reflector = (enabled: boolean) =>
  ({
    getAllAndOverride: jest.fn(() => enabled),
  }) as never;

const execCtx = (req: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
  }) as never;

describe('PermissionInterceptor.response projection', () => {
  it('projects hidden fields to null in record envelopes', async () => {
    const m = matrix();
    (m.resolveRolesForUser as jest.Mock).mockResolvedValueOnce([
      { nodes: [], recordActions: [], fieldPermissions: [] },
    ] as IPermissionRoleVo[]);
    (m.fieldAccess as jest.Mock).mockImplementation((_r, _t, fid: string) =>
      fid === 'secret' ? ('hidden' as const) : ('editable' as const)
    );

    const interceptor = new PermissionInterceptor(m, cls({ id: 'u1' }), reflector(true));
    const next = { handle: () => ({ pipe: () => ({}) }) } as never;
    // Use the public projection helper via direct method call.
    const projected = (interceptor as unknown as {
      projectResponse: (b: unknown, r: IPermissionRoleVo[], t: string) => unknown;
    }).projectResponse(
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
    expect(next).toBeTruthy();
  });

  it('passes through rows when no roles apply', () => {
    const m = matrix();
    const interceptor = new PermissionInterceptor(m, cls({ id: 'u1' }), reflector(true));
    const projected = (interceptor as unknown as {
      projectResponse: (b: unknown, r: IPermissionRoleVo[], t: string) => unknown;
    }).projectResponse(
      { records: [{ id: 'r1', fields: { name: 'alice' } }] },
      [],
      't1'
    );
    expect(projected).toEqual({ records: [{ id: 'r1', fields: { name: 'alice' } }] });
  });

  it('handles bare rows (no `fields` envelope)', () => {
    const m = matrix();
    (m.fieldAccess as jest.Mock).mockReturnValueOnce('hidden' as never);
    const interceptor = new PermissionInterceptor(m, cls({ id: 'u1' }), reflector(true));
    const projected = (interceptor as unknown as {
      projectResponse: (b: unknown, r: IPermissionRoleVo[], t: string) => unknown;
    }).projectResponse({ name: 'alice', secret: 'leak' }, [], 't1') as Record<string, unknown>;
    expect(projected.secret).toBeNull();
    expect(projected.name).toBe('alice');
  });
});
