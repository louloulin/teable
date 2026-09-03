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

/**
 * V75 — Stage 75b regression test for the field-permission P0.
 *
 * Reproduces the exact shape mismatch that caused V74 to fail:
 *   - `fieldPermission` is stored using `fieldId` (a cuid).
 *   - `getRecord` does not run `FieldKeyPipe`, so the response
 *     `fields` envelope is keyed by `fieldName` (e.g. "salary"),
 *     not by `fieldId`.
 * The interceptor must therefore look up the matching fieldId via
 * the table field metadata cache (`nameToId`) and re-test fieldAccess.
 */
import type { PrismaService } from '@teable/db-main-prisma';

describe('PermissionInterceptor.resolveFieldAccess (V75 — fieldId vs fieldName P0)', () => {
  const matrix = () => {
    const calls: Array<{ fieldId: string; result: 'hidden' | 'editable' | 'unset' }> = [];
    return {
      calls,
      fake: {
        resolveRolesForUser: vi.fn(async () => []),
        mergeRecordFilters: vi.fn(() => null),
        applyCurrentUser: vi.fn((filter) => filter),
        fieldAccess: vi.fn((_r: unknown, _t: string, fid: string) => {
          const found = calls.find((c) => c.fieldId === fid);
          return (found?.result ?? 'unset') as 'hidden' | 'editable' | 'unset';
        }),
      } as unknown as PermissionMatrixService,
      pushCall(fieldId: string, result: 'hidden' | 'editable' | 'unset') {
        calls.push({ fieldId, result });
      },
    };
  };

  const interceptorWithFieldKeys = (m: PermissionMatrixService, rows: Array<{ id: string; name: string }>) => {
    const fakePrisma = {
      tableMeta: {
        findUnique: vi.fn(async () => null),
      },
      field: {
        findMany: vi.fn(async () => rows.map((r) => ({ id: r.id, name: r.name }))),
      },
    } as unknown as PrismaService;
    return new PermissionInterceptor(m, cls({ id: 'u1' }), reflector(true), fakePrisma);
  };

  it('maps fieldName → fieldId before checking fieldAccess (the V74 P0 bug)', async () => {
    const { fake: m, pushCall } = matrix();
    // The role stores fieldPermission using the cuid:
    pushCall('fldSalaryId', 'hidden');
    const interceptor = interceptorWithFieldKeys(m, [
      { id: 'fldTitleId', name: 'title' },
      { id: 'fldSalaryId', name: 'salary' },
    ]) as unknown as {
      resolveFieldAccess: (
        roles: IPermissionRoleVo[],
        tableId: string,
        key: string,
        fieldKeys: { nameToId: Map<string, string> }
      ) => 'hidden' | 'readonly' | 'editable' | 'unset';
    };

    // Pre-populate the cache (real flow resolves via prisma).
    const fieldKeys = {
      nameToId: new Map<string, string>([
        ['title', 'fldTitleId'],
        ['salary', 'fldSalaryId'],
      ]),
      idToName: new Map<string, string>(),
      fetchedAt: Date.now(),
    };

    expect(interceptor.resolveFieldAccess([], 't1', 'salary', fieldKeys)).toBe('hidden');
    // 'title' is NOT in any role's fieldPermission → must stay 'unset' (no projection).
    expect(interceptor.resolveFieldAccess([], 't1', 'title', fieldKeys)).toBe('unset');
  });

  it('falls back to unset when neither direct key nor name→id lookup matches', async () => {
    const { fake: m, pushCall } = matrix();
    pushCall('fldSalaryId', 'hidden');
    const interceptor = interceptorWithFieldKeys(m, [
      { id: 'fldTitleId', name: 'title' },
    ]) as unknown as {
      resolveFieldAccess: (
        roles: IPermissionRoleVo[],
        tableId: string,
        key: string,
        fieldKeys: { nameToId: Map<string, string> }
      ) => 'hidden' | 'readonly' | 'editable' | 'unset';
    };
    const fieldKeys = {
      nameToId: new Map<string, string>([['title', 'fldTitleId']]),
      idToName: new Map<string, string>(),
      fetchedAt: Date.now(),
    };
    // No role entry for "salary" → unset.
    expect(interceptor.resolveFieldAccess([], 't1', 'salary', fieldKeys)).toBe('unset');
  });

  it('prefers direct key (fieldId) when response uses fieldKeyType=Id', async () => {
    const { fake: m, pushCall } = matrix();
    pushCall('fldSalaryId', 'hidden');
    const interceptor = interceptorWithFieldKeys(m, [
      { id: 'fldSalaryId', name: 'salary' },
    ]) as unknown as {
      resolveFieldAccess: (
        roles: IPermissionRoleVo[],
        tableId: string,
        key: string,
        fieldKeys: { nameToId: Map<string, string> }
      ) => 'hidden' | 'readonly' | 'editable' | 'unset';
    };
    const fieldKeys = {
      nameToId: new Map<string, string>([['salary', 'fldSalaryId']]),
      idToName: new Map<string, string>(),
      fetchedAt: Date.now(),
    };
    // Pass the key directly as the cuid → first call hits.
    expect(interceptor.resolveFieldAccess([], 't1', 'fldSalaryId', fieldKeys)).toBe('hidden');
  });

  it('returns unset when fieldKeys cache is null', async () => {
    const { fake: m } = matrix();
    const interceptor = interceptorWithFieldKeys(m, []) as unknown as {
      resolveFieldAccess: (
        roles: IPermissionRoleVo[],
        tableId: string,
        key: string,
        fieldKeys: { nameToId: Map<string, string> } | null
      ) => 'hidden' | 'readonly' | 'editable' | 'unset';
    };
    expect(interceptor.resolveFieldAccess([], 't1', 'salary', null)).toBe('unset');
  });
});
