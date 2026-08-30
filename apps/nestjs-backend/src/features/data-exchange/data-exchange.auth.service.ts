import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { DatabaseRouter } from '../../global/database-router.service';

import { exportTable, parseCsv, parseJson, validateRows } from './data-exchange.service';
import type {
  ExportFormat,
  IExportResult,
  IImportSummary,
  IRow,
  IRowStore,
  ITableData,
  IColumn,
} from './data-exchange.types';

@Injectable()
export class DataExchangeAuthService {
  constructor(private readonly prisma: PrismaService, private readonly databaseRouter?: DatabaseRouter) {}

  async exportTable(args: {
    tableId: string;
    format: ExportFormat;
    /** Limit rows for export; default 10_000. */
    limit?: number;
  }): Promise<IExportResult> {
    const table = await this.loadTable(args.tableId, args.limit ?? 10_000);
    return exportTable(table, args.format);
  }

  async import(args: {
    tableId: string;
    format: ExportFormat;
    body: string;
    /** Override the row store (default uses Prisma). */
    store?: IRowStore;
  }): Promise<IImportSummary> {
    const columns = await this.loadColumns(args.tableId);
    const rows = this.parseBody(args.format, args.body, columns);
    const summary = validateRows({ tableId: args.tableId, columns, rows });
    if (summary.errors.length > 0) return summary;
    const store = args.store ?? this;
    await store.insert({ tableId: args.tableId, rows: [...rows] });
    return summary;
  }

  async insert(input: {
    tableId: string;
    rows: ReadonlyArray<IRow>;
  }): Promise<ReadonlyArray<string>> {
    const ids: string[] = [];
    for (const row of input.rows) {
      const created = await (this.prisma as unknown as { record: { create: Function } }).record.create({
        data: { tableId: input.tableId, data: row.cells },
      });
      if (created?.id) ids.push(created.id);
    }
    return ids;
  }

  private parseBody(format: ExportFormat, body: string, columns: ReadonlyArray<IColumn>): IRow[] {
    if (format === 'csv') return parseCsv(body, columns);
    if (format === 'json') {
      const table: ITableData = parseJson(body);
      return [...table.rows];
    }
    throw new Error(`import not supported for format: ${format}`);
  }

  private async loadTable(tableId: string, limit: number): Promise<ITableData> {
    const columns = await this.loadColumns(tableId);
    const records = this.databaseRouter
      ? (await this.databaseRouter.queryDataPrismaForTable<Array<Record<string, unknown>>>(
          tableId, `SELECT * FROM "${tableId}" LIMIT ${Math.max(0, Math.floor(limit))}`
        )).map((r: Record<string, unknown>) => ({ id: String(r.__id ?? r.id), data: r }))
      : await (this.prisma as unknown as { record: { findMany: Function } }).record.findMany({
          where: { tableId }, take: limit,
        });
    const rows: IRow[] = records.map((r: { id: string; data: unknown }) => ({
      id: r.id,
      cells: r.data as Record<string, unknown>,
    }));
    return { tableId, columns, rows: [...rows] };
  }

  private async loadColumns(tableId: string): Promise<IColumn[]> {
    const fields = await this.prisma.field.findMany({ where: { tableId } });
    return fields.map((f) => ({
      id: f.id,
      name: f.name,
      type: mapFieldType(f.type),
    }));
  }
}

function mapFieldType(t: string): IColumn['type'] {
  switch (t) {
    case 'number':
      return 'number';
    case 'checkbox':
      return 'boolean';
    case 'date':
    case 'createdTime':
    case 'lastModifiedTime':
      return 'date';
    case 'json':
      return 'json';
    default:
      return 'string';
  }
}
