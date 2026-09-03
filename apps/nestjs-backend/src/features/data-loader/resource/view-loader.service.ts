/* eslint-disable sonarjs/no-duplicate-string */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../../types/cls';
import type { IViewLoaderData, IViewLoaderItem } from '../../../types/data-loader';
import { TableCommonLoader } from './table-common-loader';

@Injectable()
export class ViewLoaderService extends TableCommonLoader<IViewLoaderItem> {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cls: ClsService<IClsStore>
  ) {
    super({
      filterDataByParentId: (tableId: string) => this.getViewsInCache(tableId),
      getLoaderData: () => this.cls.get('dataLoaderCache.viewData'),
      setLoaderData: (data: IViewLoaderData) => this.cls.set('dataLoaderCache.viewData', data),
      findManyByParentId: (
        tableId: string,
        keys?: Partial<Record<string, unknown[]>>
      ) =>
        this.prismaService.txClient().view.findMany({
          where: {
            tableId,
            deletedTime: null,
            ...buildKeyWhere(keys),
          },
        }),
      findByIds: (viewIds: string[]) =>
        this.prismaService
          .txClient()
          .view.findMany({ where: { id: { in: viewIds }, deletedTime: null } }),
      clear: () => this.cls.set('dataLoaderCache.viewData', undefined),
      isEnable: () => cls.get('dataLoaderCache.cacheKeys')?.includes('view'),
    });
  }

  private getViewsInCache(tableId: string): IViewLoaderItem[] {
    const viewMap = this.cls.get('dataLoaderCache.viewData.dataMap');
    if (!viewMap?.size) {
      return [];
    }
    return Array.from(viewMap.values()).filter((view) => view.tableId === tableId);
  }
}


function buildKeyWhere(
  keys?: Partial<Record<string, unknown[]>>
): Record<string, unknown> {
  if (!keys) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(keys)) {
    if (Array.isArray(v) && v.length > 0) {
      out[k] = v.length === 1 ? v[0] : { in: v };
    }
  }
  return out;
}
