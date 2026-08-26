import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { HttpErrorCode } from '@teable/core';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@teable/db-main-prisma';

import { CustomHttpException } from '../../custom.exception';
import { PermissionInterceptor } from './permission.interceptor';
import { PermissionGuard } from './permission.guard';
import { PermissionMatrixService } from './permission-matrix.service';
import { IPermissionRoleVo, PermissionFilter } from './permission-matrix.constants';

// ─── helpers ────────────────────────────────────────────────────────────────

const makeMatrix = (overrides: Partial<PermissionMatrixService> = {}): PermissionMatrixService => {
  const fake = {
    resolveRolesForUser: vi.fn(async () => []),
    fieldAccess: vi.fn(() => 'unset' as const),
    mergeRecordFilters: vi.fn(() => null as PermissionFilter | null),
    applyCurrentUser: vi.fn((filter: PermissionFilter) => filter),
    allowsAction: vi.fn(() => true),
    ...overrides,
  };
  return fake as unknown as PermissionMatrixService;
};

const makeCls = (user?: { id: string }) =>
  ({
    get: (key: string) => (key === 'user' ? user : undefined),
  }) as never;

const makeReflector = (action?: 'view' | 'update' | 'create' | 'delete' | 'comment') =>
  ({
    getAllAndOverride: vi.fn(() => action),
  }) as never;

const makeCtx = (req: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode: 200 }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

const baseRoleVo = (): IPermissionRoleVo =>
  ({
    id: 'pr_1',
    baseId: 'b1',
    name: 'sales-rep',
    description: null,
    status: 'enabled',
    members: ['u1'],
    nodes: [{ tableId: 't1', access: 'editable' }],
    fieldPermissions: [],
    recordActions: [{ tableId: 't1', action: 'update' }],
    recordFilter: null,
  }) as IPermissionRoleVo;

// ─── Decision Point 1: allow (role permits update, body has no hidden field) ──

describe('PermissionGuard + PermissionInterceptor wiring — G2-001', () => {
  it('allows: role permits update + body has no hidden field → canActivate returns true', async () => {
    const matrix = makeMatrix({
      resolveRolesForUser: vi.fn(async () => [baseRoleVo()]),
      allowsAction: vi.fn(() => true),
      fieldAccess: vi.fn(() => 'editable' as const),
    });
    const guard = new PermissionGuard(matrix, makeCls({ id: 'u1' }), makeReflector('update'));
    const req = {
      method: 'PATCH',
      params: { tableId: 't1', baseId: 'b1' },
      body: { fields: { name: 'alice', email: 'a@b.com' } },
    };
    await expect(guard.canActivate(makeCtx(req))).resolves.toBe(true);
  });

  // ─── Decision Point 2: deny (role disallows update) ────────────────────────

  it('denies: role set disallows update action → throws CustomHttpException RESTRICTED_RESOURCE', async () => {
    const matrix = makeMatrix({
      resolveRolesForUser: vi.fn(async () => [baseRoleVo()]),
      allowsAction: vi.fn(() => false),
    });
    const guard = new PermissionGuard(matrix, makeCls({ id: 'u1' }), makeReflector('delete'));
    const req = {
      method: 'DELETE',
      params: { tableId: 't1', baseId: 'b1' },
      body: {},
    };
    await expect(guard.canActivate(makeCtx(req))).rejects.toBeInstanceOf(CustomHttpException);
    await expect(guard.canActivate(makeCtx(req))).rejects.toMatchObject({
      code: HttpErrorCode.RESTRICTED_RESOURCE,
    });
  });

  // ─── Decision Point 3: hidden field (PATCH body contains a hidden field) ──

  it('hidden field: body contains a field marked hidden by the role set → throws RESTRICTED_RESOURCE', async () => {
    const matrix = makeMatrix({
      resolveRolesForUser: vi.fn(async () => [baseRoleVo()]),
      allowsAction: vi.fn(() => true),
      fieldAccess: vi.fn((_r, _t, fid: string) =>
        fid === 'secret' ? ('hidden' as const) : ('editable' as const)
      ),
    });
    const guard = new PermissionGuard(matrix, makeCls({ id: 'u1' }), makeReflector('update'));
    const req = {
      method: 'PATCH',
      params: { tableId: 't1', baseId: 'b1' },
      body: { fields: { name: 'alice', secret: 'leak' } },
    };
    await expect(guard.canActivate(makeCtx(req))).rejects.toBeInstanceOf(CustomHttpException);
    await expect(guard.canActivate(makeCtx(req))).rejects.toMatchObject({
      code: HttpErrorCode.RESTRICTED_RESOURCE,
    });
  });

  it('hidden field: also throws on POST even when no @RequirePermission decorator is present', async () => {
    const matrix = makeMatrix({
      resolveRolesForUser: vi.fn(async () => [baseRoleVo()]),
      allowsAction: vi.fn(() => true),
      fieldAccess: vi.fn((_r, _t, fid: string) =>
        fid === 'secret' ? ('hidden' as const) : ('editable' as const)
      ),
    });
    const guard = new PermissionGuard(matrix, makeCls({ id: 'u1' }), makeReflector(undefined));
    const req = {
      method: 'POST',
      params: { tableId: 't1', baseId: 'b1' },
      body: { fields: { secret: 'leak' } },
    };
    await expect(guard.canActivate(makeCtx(req))).rejects.toBeInstanceOf(CustomHttpException);
  });

  // ─── Decision Point 4: row filter (AND-merged filter stashed on req) ───────

  it('row filter: AND-merged record filter is stashed on req.permission.filter and AND-merges across roles', async () => {
    const mergedFilter = {
      conjunction: 'and',
      items: [
        { field: 'owner', operator: 'is', value: 'u1' },
        { field: 'region', operator: 'is', value: 'emea' },
      ],
    };
    const matrix = makeMatrix({
      resolveRolesForUser: vi.fn(async () => [baseRoleVo()]),
      mergeRecordFilters: vi.fn(() => mergedFilter as unknown as PermissionFilter),
      applyCurrentUser: vi.fn((filter: PermissionFilter) => filter),
    });
    const interceptor = new PermissionInterceptor(matrix, makeCls({ id: 'u1' }));
    const req: Record<string, unknown> = {
      method: 'GET',
      params: { tableId: 't1', baseId: 'b1' },
      body: {},
    };

    const next: CallHandler = { handle: () => of({ records: [{ id: 'r1' }] }) };
    const result = await firstValueFrom(interceptor.intercept(makeCtx(req), next));

    // The handler response must flow through untouched when no field-permission projection applies.
    expect(result).toEqual({ records: [{ id: 'r1' }] });

    // The merged filter must be stashed on req.permission.filter so downstream
    // Prisma `where` composition can AND-merge it.
    expect(req.permission).toBeDefined();
    expect((req.permission as { filter: unknown }).filter).toBe(mergedFilter);
    expect(matrix.applyCurrentUser).toHaveBeenCalledWith(mergedFilter, 'u1');
  });

  it('row filter: writes null when no roles apply (admin / owner path)', async () => {
    const matrix = makeMatrix(); // resolveRolesForUser returns []
    const interceptor = new PermissionInterceptor(matrix, makeCls({ id: 'u1' }));
    const req: Record<string, unknown> = {
      method: 'GET',
      params: { tableId: 't1', baseId: 'b1' },
      body: {},
    };

    const next: CallHandler = { handle: () => of({ records: [{ id: 'r1' }] }) };
    await firstValueFrom(interceptor.intercept(makeCtx(req), next));

    expect(req.permission).toBeDefined();
    expect((req.permission as { filter: unknown }).filter).toBeNull();
  });

  it('row filter: skips entirely when tableId/baseId context is missing (route does not target a table)', async () => {
    const matrix = makeMatrix();
    const interceptor = new PermissionInterceptor(matrix, makeCls({ id: 'u1' }));
    const req: Record<string, unknown> = {
      method: 'GET',
      params: {},
      body: {},
    };

    const next: CallHandler = { handle: () => of({ ping: 'pong' }) };
    const result = await firstValueFrom(interceptor.intercept(makeCtx(req), next));

    expect(result).toEqual({ ping: 'pong' });
    expect(req.permission).toBeUndefined();
    expect(matrix.resolveRolesForUser).not.toHaveBeenCalled();
  });
});
