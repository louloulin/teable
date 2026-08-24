import { HttpErrorCode } from '@teable/core';
import { CustomHttpException } from '../../custom.exception';
import { PermissionMatrixService } from './permission-matrix.service';
import { PermissionGuard } from './permission.guard';
import { IPermissionRoleVo } from './permission-matrix.constants';

const matrix = (): PermissionMatrixService => {
  const fake = {
    resolveRolesForUser: jest.fn(async () => []),
    fieldAccess: jest.fn(() => 'unset' as const),
    allowsAction: jest.fn(() => true),
  };
  return fake as unknown as PermissionMatrixService;
};

const cls = (user?: { id: string }) =>
  ({
    get: (key: string) => (key === 'user' ? user : undefined),
  }) as never;

const reflector = (action?: 'view' | 'update' | 'create' | 'delete' | 'comment') =>
  ({
    getAllAndOverride: jest.fn(() => action),
  }) as never;

const execCtx = (req: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
  }) as never;

describe('PermissionGuard', () => {
  it('skips when no action metadata', async () => {
    const guard = new PermissionGuard(matrix(), cls({ id: 'u1' }), reflector(undefined));
    expect(await guard.canActivate(execCtx({ params: { tableId: 't1', baseId: 'b1' } }))).toBe(true);
  });

  it('skips when user has no role on the base (admins fall through)', async () => {
    const guard = new PermissionGuard(matrix(), cls({ id: 'u1' }), reflector('update'));
    expect(await guard.canActivate(execCtx({ params: { tableId: 't1', baseId: 'b1' } }))).toBe(true);
  });

  it('throws when role set disallows the action', async () => {
    const m = matrix();
    (m.resolveRolesForUser as jest.Mock).mockResolvedValueOnce([
      { nodes: [], recordActions: [], fieldPermissions: [] },
    ] as IPermissionRoleVo[]);
    (m.allowsAction as jest.Mock).mockReturnValueOnce(false);
    const guard = new PermissionGuard(m, cls({ id: 'u1' }), reflector('delete'));
    await expect(
      guard.canActivate(execCtx({ params: { tableId: 't1', baseId: 'b1' } }))
    ).rejects.toBeInstanceOf(CustomHttpException);
  });

  it('allows when role set permits the action', async () => {
    const m = matrix();
    (m.resolveRolesForUser as jest.Mock).mockResolvedValueOnce([
      { nodes: [], recordActions: [], fieldPermissions: [] },
    ] as IPermissionRoleVo[]);
    const guard = new PermissionGuard(m, cls({ id: 'u1' }), reflector('view'));
    expect(await guard.canActivate(execCtx({ params: { tableId: 't1', baseId: 'b1' } }))).toBe(true);
  });

  it('throws when body tries to set a hidden field', async () => {
    const m = matrix();
    (m.resolveRolesForUser as jest.Mock).mockResolvedValueOnce([
      { nodes: [], recordActions: [], fieldPermissions: [] },
    ] as IPermissionRoleVo[]);
    (m.fieldAccess as jest.Mock).mockImplementation((_r, _t, fid: string) =>
      fid === 'secret' ? ('hidden' as const) : ('editable' as const)
    );
    const guard = new PermissionGuard(m, cls({ id: 'u1' }), reflector('update'));
    await expect(
      guard.assertFieldEditAllowed(
        { body: { fields: { name: 'ok', secret: 'leak' } } },
        't1',
        'b1'
      )
    ).rejects.toMatchObject({ code: HttpErrorCode.RESTRICTED_RESOURCE });
  });

  it('passes when no body is provided', async () => {
    const guard = new PermissionGuard(matrix(), cls({ id: 'u1' }), reflector('update'));
    await expect(guard.assertFieldEditAllowed({}, 't1', 'b1')).resolves.toBeUndefined();
  });
});
