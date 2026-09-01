import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { IPermissionRoleVo } from './permission-matrix.constants';
import type { PermissionMatrixService } from './permission-matrix.service';
import { PermissionInterceptor } from './permission.interceptor';

const matrix = (): PermissionMatrixService => {
  const fake = {
    resolveRolesForUser: vi.fn(async () => []),
    mergeRecordFilters: vi.fn(() => null),
    applyCurrentUser: vi.fn((filter) => filter),
    fieldAccess: vi.fn(() => 'unset' as const),
  };
  return fake as unknown as PermissionMatrixService;
};

const role = (overrides: Partial<IPermissionRoleVo> = {}): IPermissionRoleVo => ({
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
  ...overrides,
});

const cls = (user?: { id: string }) =>
  ({
    get: (key: string) => (key === 'user' ? user : undefined),
  }) as never;

const reflector = (enabled: boolean) =>
  ({
    getAllAndOverride: vi.fn(() => enabled),
  }) as never;

const execCtx = (req: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as never;

describe('PermissionInterceptor.response projection', () => {
  it('stashes the resolved row filter before invoking the handler', async () => {
    const m = matrix();
    (m.resolveRolesForUser as Mock).mockResolvedValueOnce([
      role({
        nodes: [{ tableId: 't1', access: 'editable' }],
        recordActions: [{ tableId: 't1', action: 'view' }],
        recordFilter: { tableId: 't1', filter: { ownerId: '$current_user' } },
      }),
    ]);
    (m.mergeRecordFilters as Mock).mockReturnValueOnce({ ownerId: '$current_user' });
    (m.applyCurrentUser as Mock).mockReturnValueOnce({ ownerId: 'u1' });
    const req = { params: { tableId: 't1', baseId: 'b1' } } as Record<string, unknown>;
    const interceptor = new PermissionInterceptor(m, cls({ id: 'u1' }), reflector(true));
    const next = { handle: () => of({ ok: true }) };

    await lastValueFrom(interceptor.intercept(execCtx(req), next as never));
    expect(req).toMatchObject({ permission: { filter: { ownerId: 'u1' } } });
  });

  it('projects hidden fields to null in record envelopes', async () => {
    const m = matrix();
    (m.resolveRolesForUser as Mock).mockResolvedValueOnce([
      role(),
    ]);
    (m.fieldAccess as Mock).mockImplementation((_r, _t, fid: string) =>
      fid === 'secret' ? ('hidden' as const) : ('editable' as const)
    );

    const interceptor = new PermissionInterceptor(m, cls({ id: 'u1' }), reflector(true));
    const next = { handle: () => ({ pipe: () => ({}) }) } as never;
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
      [role()],
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
    const projected = (
      interceptor as unknown as {
        projectResponse: (b: unknown, r: IPermissionRoleVo[], t: string) => unknown;
      }
    ).projectResponse({ records: [{ id: 'r1', fields: { name: 'alice' } }] }, [], 't1');
    expect(projected).toEqual({ records: [{ id: 'r1', fields: { name: 'alice' } }] });
  });

  it('handles bare rows (no `fields` envelope)', () => {
    const m = matrix();
    (m.fieldAccess as Mock).mockImplementation((_r, _t, fid: string) =>
      fid === 'secret' ? ('hidden' as const) : ('editable' as const)
    );
    const interceptor = new PermissionInterceptor(m, cls({ id: 'u1' }), reflector(true));
    const projected = (
      interceptor as unknown as {
        projectResponse: (b: unknown, r: IPermissionRoleVo[], t: string) => unknown;
      }
    ).projectResponse({ name: 'alice', secret: 'leak' }, [], 't1') as Record<string, unknown>;
    expect(projected.secret).toBeNull();
    expect(projected.name).toBe('alice');
  });
});
