import { isEmpty } from 'lodash';
import type {
  IFieldLoaderItem,
  ITableLoaderItem,
  IViewLoaderItem,
} from '../../../types/data-loader';

type IDataLoaderDataItem = IViewLoaderItem | ITableLoaderItem | IFieldLoaderItem;

// Loose keys type. Extracted so that the deep distributive T[K] resolution
// happens at the alias level (once) rather than every time TS resolves
// findManyByParentId inside a union-typed subclass. Internal `load()` still
// uses the strict generic — runtime semantics unchanged.
type FindManyKeys = Record<string, unknown[]>;

interface ITableCommonLoaderArgs<T extends IDataLoaderDataItem> {
  filterDataByParentId: (parentId: string) => T[];
  getLoaderData: () =>
    | {
        fullParentIds?: string[];
        dataMap: Map<string, T>;
      }
    | undefined;
  setLoaderData: ({
    fullParentIds,
    dataMap,
  }: {
    fullParentIds?: string[];
    dataMap: Map<string, T>;
  }) => void;
  findManyByParentId: (parentId: string, keys?: Partial<FindManyKeys>) => Promise<T[]>;
  findByIds: (ids: string[]) => Promise<T[]>;
  clear: () => void;
  isEnable?: () => boolean | undefined;
}

export class TableCommonLoader<T extends IDataLoaderDataItem> {
  private readonly filterDataByParentId: ITableCommonLoaderArgs<T>['filterDataByParentId'];
  private readonly getLoaderData: ITableCommonLoaderArgs<T>['getLoaderData'];
  private readonly setLoaderData: ITableCommonLoaderArgs<T>['setLoaderData'];
  private readonly findManyByParentId: ITableCommonLoaderArgs<T>['findManyByParentId'];
  private readonly findByIds: ITableCommonLoaderArgs<T>['findByIds'];
  readonly clear: ITableCommonLoaderArgs<T>['clear'];
  readonly isEnable: ITableCommonLoaderArgs<T>['isEnable'];

  constructor({
    filterDataByParentId,
    getLoaderData,
    setLoaderData,
    findManyByParentId,
    findByIds,
    clear,
    isEnable,
  }: ITableCommonLoaderArgs<T>) {
    this.filterDataByParentId = filterDataByParentId;
    this.getLoaderData = getLoaderData;
    this.setLoaderData = setLoaderData;
    this.findManyByParentId = findManyByParentId;
    this.findByIds = findByIds;
    this.clear = clear;
    this.isEnable = isEnable;
  }

  private async sortByOrder(dataArray: T[]) {
    if (!dataArray.length) {
      return [];
    }
    return dataArray.sort((a, b) => a.order - b.order);
  }

  private async getData(parentId: string) {
    const { fullParentIds, dataMap = new Map() } = this.getLoaderData() ?? {};
    if (fullParentIds?.includes(parentId)) {
      return this.sortByOrder(this.filterDataByParentId(parentId));
    }

    const newData = await this.findManyByParentId(parentId);

    newData.forEach((item) => {
      dataMap.set(item.id, item);
    });

    this.setLoaderData({
      dataMap,
      fullParentIds: [...(fullParentIds ?? []), parentId],
    });
    return this.sortByOrder(newData);
  }

  private filterByKeys(data: T[], keys?: Partial<FindManyKeys>) {
    if (isEmpty(keys)) {
      return data;
    }

    return data.filter((item) => {
      const rec = item as unknown as Record<string, unknown>;
      return Object.entries(keys).every(([key, values]) => {
        if (values === undefined) {
          return true;
        }
        if (values && (values as unknown[]).length === 0) {
          return false;
        }
        return (values as unknown[])?.includes(rec[key]);
      });
    });
  }

  async load(parentId: string, keys?: Partial<Record<string, unknown[]>>): Promise<T[]> {
    const loose = keys as Partial<FindManyKeys>;
    if (!this.isEnable?.()) {
      return this.findManyByParentId(parentId, loose);
    }
    const data = await this.getData(parentId);
    return this.filterByKeys(data, loose);
  }

  async loadByIds(ids: string[]): Promise<T[]> {
    if (!this.isEnable?.()) {
      return this.findByIds(ids);
    }
    const loaderData = this.getLoaderData();
    const { dataMap = new Map() } = loaderData ?? {};

    const cachedData: T[] = [];
    const notCachedDataIds: string[] = [];
    ids.forEach((id) => {
      const data = dataMap.get(id);
      if (data) {
        cachedData.push(data);
      } else {
        notCachedDataIds.push(id);
      }
    });
    if (notCachedDataIds.length) {
      const newData = await this.findByIds(notCachedDataIds);
      newData.forEach((data) => {
        dataMap.set(data.id, data);
      });
      this.setLoaderData({
        ...loaderData,
        dataMap,
      });
      return ids.map((id) => dataMap.get(id)).filter(Boolean) as T[];
    }
    return cachedData;
  }
}
