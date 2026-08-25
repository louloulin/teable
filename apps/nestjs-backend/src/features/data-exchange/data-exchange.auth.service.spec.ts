/* eslint-disable @typescript-eslint/naming-convention */
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { DataExchangeAuthService } from './data-exchange.auth.service';
import { buildJson } from './data-exchange.service';

function mkPrismaMock() {
  const fieldFindMany = vi.fn();
  const recordFindMany = vi.fn();
  const recordCreate = vi.fn();
  const prisma = {
    field: { findMany: fieldFindMany },
    record: {
      findMany: recordFindMany,
      create: recordCreate,
    },
  } as unknown as PrismaService;
  return { prisma, mocks: { fieldFindMany, recordFindMany, recordCreate } };
}

describe('DataExchangeAuthService', () => {
  describe('exportTable', () => {
    it('exports as CSV', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.fieldFindMany.mockResolvedValue([
        { id: 'name', name: 'Name', type: 'singleLineText', tableId: 'tbl' },
        { id: 'count', name: 'Count', type: 'number', tableId: 'tbl' },
      ]);
      mocks.recordFindMany.mockResolvedValue([
        { id: 'r1', tableId: 'tbl', data: { name: 'Alice', count: 1 } },
      ]);
      const svc = new DataExchangeAuthService(prisma);
      const out = await svc.exportTable({ tableId: 'tbl', format: 'csv' });
      expect(out.format).toBe('csv');
      expect(out.rowCount).toBe(1);
      expect(out.body).toContain('Alice');
    });

    it('exports as JSON', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.fieldFindMany.mockResolvedValue([
        { id: 'name', name: 'Name', type: 'text', tableId: 'tbl' },
      ]);
      mocks.recordFindMany.mockResolvedValue([
        { id: 'r1', tableId: 'tbl', data: { name: 'Alice' } },
      ]);
      const svc = new DataExchangeAuthService(prisma);
      const out = await svc.exportTable({ tableId: 'tbl', format: 'json' });
      expect(out.format).toBe('json');
      expect(out.body).toContain('Alice');
    });
  });

  describe('import', () => {
    it('imports JSON rows via Prisma', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.fieldFindMany.mockResolvedValue([
        { id: 'name', name: 'Name', type: 'text', tableId: 'tbl' },
        { id: 'count', name: 'Count', type: 'number', tableId: 'tbl' },
      ]);
      mocks.recordCreate.mockResolvedValue({ id: 'r_new' });
      const svc = new DataExchangeAuthService(prisma);
      const body = buildJson({
        tableId: 'tbl',
        columns: [
          { id: 'name', name: 'Name', type: 'string' },
          { id: 'count', name: 'Count', type: 'number' },
        ],
        rows: [{ cells: { name: 'Alice', count: 1 } }],
      });
      const out = await svc.import({ tableId: 'tbl', format: 'json', body });
      expect(out.imported).toBe(1);
      expect(mocks.recordCreate).toHaveBeenCalledTimes(1);
    });

    it('rejects bad import with errors', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.fieldFindMany.mockResolvedValue([
        { id: 'name', name: 'Name', type: 'text', tableId: 'tbl' },
      ]);
      const svc = new DataExchangeAuthService(prisma);
      const out = await svc.import({
        tableId: 'tbl',
        format: 'json',
        body: JSON.stringify({
          version: 1,
          tableId: 'tbl',
          columns: [{ id: 'name', name: 'Name', type: 'string' }],
          rows: [{ cells: { unknown_col: 'x' } }],
        }),
      });
      expect(out.errors.length).toBeGreaterThan(0);
      expect(out.imported).toBe(0);
    });
  });
});
