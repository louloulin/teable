/**
 * PDF / print template export — Stage 57 (auth layer).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import type {
  IPdfBuildResult,
  IPdfDocumentOptions,
  IColumn,
  IRow,
  ITableData,
} from '../data-exchange/data-exchange.types';
import { buildDocument, buildTableLayout, paginateTable } from './pdf-export.service';
import type { IDocumentDraft, ITableDraft } from './pdf-export.service';

const ROWS_PER_PAGE = 28;
const MARGIN = 36;

@Injectable()
export class PdfExportAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async exportTable(args: {
    tableId: string;
    format?: 'pdf';
    options?: Partial<IPdfDocumentOptions>;
    title?: string;
    limit?: number;
  }): Promise<{
    format: 'pdf';
    contentType: string;
    body: string;
    byteLength: number;
    pageCount: number;
  }> {
    if ((args.format ?? 'pdf') !== 'pdf') throw new Error('only pdf format supported here');

    const table = await this.loadTable(args.tableId, args.limit ?? 1000);
    const result = renderTablePdf(table, args.title ?? `Table ${args.tableId}`, args.options);
    return {
      format: 'pdf',
      contentType: 'application/pdf',
      body: result.base64,
      byteLength: result.bytes.length,
      pageCount: result.pageCount,
    };
  }

  private async loadTable(tableId: string, limit: number): Promise<ITableData> {
    const fields = await this.prisma.field.findMany({ where: { tableId } });
    const columns: IColumn[] = fields.map((f) => ({ id: f.id, name: f.name }));
    const records = await this.prisma.record.findMany({ where: { tableId }, take: limit });
    const rows: IRow[] = records.map((r) => ({
      id: r.id,
      cells: (r.data ?? {}) as Record<string, unknown>,
    }));
    return { tableId, columns, rows };
  }
}

export function renderTablePdf(
  table: ITableData,
  title: string,
  options: Partial<IPdfDocumentOptions> = {}
): IPdfBuildResult {
  const opts: IPdfDocumentOptions = {
    title,
    author: options.author ?? 'Teable OSS',
    pageSize: options.pageSize ?? 'A4',
    orientation: options.orientation ?? 'portrait',
    header: options.header ?? title,
    footer: options.footer ?? 'Page {page} of {total}',
    includeQr: options.includeQr ?? false,
    qrPayload: options.qrPayload,
  };
  const tableDraft: ITableDraft = {
    header: table.columns.map((c) => c.name),
    rows: table.rows.map((r) => table.columns.map((c) => formatCell(r.cells[c.id]))),
  };
  const draft: IDocumentDraft = {
    options: opts,
    buildPages: (page) => {
      const blocks = paginateTable(tableDraft, {
        x: MARGIN,
        y: MARGIN + 24,
        width: page.width - MARGIN * 2,
        pageRows: ROWS_PER_PAGE,
      });
      return blocks.map((tableBlock) => ({ blocks: [tableBlock] }));
    },
  };
  return buildDocument(draft);
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function renderSummaryPdf(
  title: string,
  summary: { label: string; value: string }[],
  options: Partial<IPdfDocumentOptions> = {}
): IPdfBuildResult {
  const opts: IPdfDocumentOptions = {
    title,
    author: options.author ?? 'Teable OSS',
    pageSize: options.pageSize ?? 'A4',
    orientation: options.orientation ?? 'portrait',
    header: options.header ?? title,
    footer: options.footer ?? 'Page {page} of {total}',
    includeQr: options.includeQr ?? false,
    qrPayload: options.qrPayload,
  };
  const draft: IDocumentDraft = {
    options: opts,
    buildPages: () => [
      {
        blocks: [
          buildTableLayout(
            {
              header: ['Label', 'Value'],
              rows: summary.map((s) => [s.label, s.value]),
            },
            { x: MARGIN, y: 80, width: 480 }
          ),
        ],
      },
    ],
  };
  return buildDocument(draft);
}
