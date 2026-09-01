import { ViewOpenApiController } from './view-open-api.controller';
import type { PermissionMatrixService } from '../../permission-matrix/permission-matrix.service';
import type { IViewVo } from '@teable/core';

describe('ViewOpenApiController.getViews — R-PERM-2 last-mile', () => {
  function build(opts: {
    views: IViewVo[];
    userId?: string;
    baseId?: string;
    resolveViewsAccessibleForUser?: ReturnType<typeof vi.fn>;
  }) {
    const viewService = { getViews: vi.fn().mockResolvedValue(opts.views) } as never;
    const viewOpenApiService = {} as never;
    const viewOpenApiV2Service = {} as never;
    const tableDomainQueryService = {
      getTableDomainById: vi.fn().mockResolvedValue({ id: opts.baseId ?? 'b1' }),
    } as never;
    const cls = {
      get: vi.fn().mockReturnValue(opts.userId ? { id: opts.userId } : undefined),
    } as never;
    const permissionMatrix: PermissionMatrixService = {
      resolveViewsAccessibleForUser:
        opts.resolveViewsAccessibleForUser ??
        vi.fn().mockResolvedValue(null),
    } as unknown as PermissionMatrixService;
    return new ViewOpenApiController(
      viewService,
      viewOpenApiService,
      viewOpenApiV2Service,
      tableDomainQueryService,
      cls,
      permissionMatrix
    );
  }

  const views: IViewVo[] = [
    { id: 'v1', name: 'All' } as unknown as IViewVo,
    { id: 'v2', name: 'Sales' } as unknown as IViewVo,
    { id: 'v3', name: 'Marketing' } as unknown as IViewVo,
  ];

  it('returns every view when no user is in CLS (anonymous + AllowAnonymous)', async () => {
    const controller = build({ views });
    const result = await controller.getViews('t1');
    expect(result.map((v) => v.id)).toStrictEqual(['v1', 'v2', 'v3']);
  });

  it('returns every view when resolveViewsAccessibleForUser returns null (admin)', async () => {
    const controller = build({
      views,
      userId: 'u1',
      resolveViewsAccessibleForUser: vi.fn().mockResolvedValue(null),
    });
    const result = await controller.getViews('t1');
    expect(result.map((v) => v.id)).toStrictEqual(['v1', 'v2', 'v3']);
  });

  it('filters to the allow-list when the role restricts views', async () => {
    const resolveViewsAccessibleForUser = vi
      .fn()
      .mockResolvedValue(['v1', 'v3']);
    const controller = build({ views, userId: 'u1', resolveViewsAccessibleForUser });
    const result = await controller.getViews('t1');
    expect(result.map((v) => v.id)).toStrictEqual(['v1', 'v3']);
    expect(resolveViewsAccessibleForUser).toHaveBeenCalledWith('b1', 'u1', 't1');
  });

  it('returns an empty list when the user is allowed no views on the table', async () => {
    const controller = build({
      views,
      userId: 'u1',
      resolveViewsAccessibleForUser: vi.fn().mockResolvedValue([]),
    });
    const result = await controller.getViews('t1');
    expect(result).toStrictEqual([]);
  });

  it('skips the matrix check when the permission-matrix module is not wired', async () => {
    const viewService = { getViews: vi.fn().mockResolvedValue(views) } as never;
    const viewOpenApiService = {} as never;
    const viewOpenApiV2Service = {} as never;
    const tableDomainQueryService = {} as never;
    const cls = { get: vi.fn().mockReturnValue({ id: 'u1' }) } as never;
    const controller = new ViewOpenApiController(
      viewService,
      viewOpenApiService,
      viewOpenApiV2Service,
      tableDomainQueryService,
      cls,
      // permission matrix intentionally omitted
      undefined
    );
    const result = await controller.getViews('t1');
    expect(result.map((v) => v.id)).toStrictEqual(['v1', 'v2', 'v3']);
  });
});
