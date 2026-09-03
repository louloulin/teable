/* eslint-disable sonarjs/no-duplicate-string */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../../types/cls';
import type { ITableLoaderData, ITableLoaderItem } from '../../../types/data-loader';
import { TableCommonLoader } from './table-common-loader';

@Injectable()
export class TableLoaderService extends TableCommonLoader<ITableLoaderItem> {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly cls: ClsService<IClsStore>
  ) {
    super({
      filterDataByParentId: (baseId: string) => this.filterTablesByParentId(baseId),
      getLoaderData: () => this.cls.get('dataLoaderCache.tableData'),
      setLoaderData: (data: ITableLoaderData) => this.cls.set('dataLoaderCache.tableData', data),
      findManyByParentId: (
        baseId: string,
        keys?: Partial<Record<string, unknown[]>>
      ) =>
        this.prismaService.txClient().tableMeta.findMany({
          where: {
            baseId,
            deletedTime: null,
            ...buildKeyWhere(keys),
          },
        }),
      findByIds: (tableIds: string[]) =>
        this.prismaService
          .txClient()
          .tableMeta.findMany({ where: { id: { in: tableIds }, deletedTime: null } }),
      clear: () => this.cls.set('dataLoaderCache.tableData', undefined),
      isEnable: () => cls.get('dataLoaderCache.cacheKeys')?.includes('table'),
    });
  }

  private filterTablesByParentId(baseId: string) {
    const tableMap = this.cls.get('dataLoaderCache.tableData.dataMap');
    if (!tableMap?.size) {
      return [];
    }
    return Array.from(tableMap.values()).filter((table) => table.baseId === baseId);
  }

  private findTables(baseId: string, keys?: Partial<Record<string, unknown[]>>) {
    return this.prismaService.txClient().tableMeta.findMany({
      where: {
        baseId,
        deletedTime: null,
        ...buildKeyWhere(keys),
      },
    });
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
