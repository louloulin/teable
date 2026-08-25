/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import type { ITableData } from '../data-exchange/data-exchange.types';
import { PdfExportAuthService, renderSummaryPdf, renderTablePdf } from './pdf-export.auth.service';

function mkPrismaMock() {
  const fieldFindMany = vi.fn();
  const recordFindMany = vi.fn();
  const prisma = {
    field: { findMany: fieldFindMany },
    record: { findMany: recordFindMany },
  } as unknown as PrismaService;
  return { prisma, mocks: { fieldFindMany, recordFindMany } };
}

const baseTable: ITableData = {
  tableId: 'tbl',
  columns: [
    { id: 'name', name: 'Name' },
    { id: 'count', name: 'Count' },
  ],
  rows: [
    { cells: { name: 'Alice', count: 1 } },
    { cells: { name: 'Bob', count: 2 } },
    { cells: { name: 'Carol', count: 3 } },
  ],
};

describe('renderTablePdf (pure)', () => {
  it('produces a single-page PDF for small tables', () => {
    const out = renderTablePdf(baseTable, 'Test Table');
    expect(out.pageCount).toBe(1);
    expect(out.bytes.length).toBeGreaterThan(0);
  });
  it('pages through large tables', () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({
      cells: { name: `row_${i}`, count: i },
    }));
    const large: ITableData = { ...baseTable, rows };
    const out = renderTablePdf(large, 'Big', { pageSize: 'A4' });
    expect(out.pageCount).toBeGreaterThan(3);
  });
  it('renders in landscape', () => {
    const out = renderTablePdf(baseTable, 'Wide', { orientation: 'landscape' });
    expect(out.pageCount).toBe(1);
  });
  it('includes QR when requested', () => {
    const out = renderTablePdf(baseTable, 'T', {
      includeQr: true,
      qrPayload: 'https://example.com/share/x',
    });
    expect(out.pageCount).toBe(1);
  });
});

describe('renderSummaryPdf (pure)', () => {
  it('produces one page with header + footer', () => {
    const out = renderSummaryPdf('Summary', [
      { label: 'Total', value: '42' },
      { label: 'Avg', value: '7' },
    ]);
    expect(out.pageCount).toBe(1);
  });
});

describe('PdfExportAuthService', () => {
  it('exports a table via Prisma', async () => {
    const { prisma, mocks } = mkPrismaMock();
    mocks.fieldFindMany.mockResolvedValue([
      { id: 'name', name: 'Name', tableId: 'tbl', type: 'text' },
    ]);
    mocks.recordFindMany.mockResolvedValue([{ id: 'r1', tableId: 'tbl', data: { name: 'Alice' } }]);
    const svc = new PdfExportAuthService(prisma);
    const out = await svc.exportTable({ tableId: 'tbl', title: 'My Table' });
    expect(out.format).toBe('pdf');
    expect(out.contentType).toBe('application/pdf');
    expect(out.body.length).toBeGreaterThan(0);
    expect(out.pageCount).toBe(1);
  });
  it('rejects non-pdf format', async () => {
    const { prisma } = mkPrismaMock();
    const svc = new PdfExportAuthService(prisma);
    await expect(svc.exportTable({ tableId: 'tbl', format: 'xlsx' as never })).rejects.toThrow();
  });
});
