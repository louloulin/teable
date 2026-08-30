/* eslint-disable @typescript-eslint/naming-convention */
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@teable/db-main-prisma';
import { vi } from 'vitest';

import { FullTextSearchAuthService } from './full-text-search.auth.service';

interface IMockDocumentRow {
  id: string;
  indexId: string;
  recordId: string;
  bodyText: string;
  tokens: string;
}

function mkRow(over: Partial<IMockDocumentRow> = {}): IMockDocumentRow {
  return {
    id: 'idx_1',
    indexId: 'tbl',
    recordId: 'rec_1:fld_1',
    bodyText: 'hello world',
    tokens: 'hello world',
    ...over,
  };
}

function mkPrismaMock() {
  const upsert = vi.fn();
  const findUnique = vi.fn();
  const findMany = vi.fn();
  const deleteMany = vi.fn();
  const prisma = {
    searchDocument: { upsert, findUnique, findMany, deleteMany },
  } as unknown as PrismaService;
  return { prisma, mocks: { upsert, findUnique, findMany, deleteMany } };
}

describe('FullTextSearchAuthService', () => {
  describe('indexDocument', () => {
    it('upserts and returns the indexed doc', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.upsert.mockResolvedValue(mkRow());
      const svc = new FullTextSearchAuthService(prisma);
      const out = await svc.indexDocument({
        tableId: 'tbl',
        recordId: 'rec_1',
        fieldId: 'fld_1',
        text: 'hello world',
      });
      expect(out.tokens).toContain('hello');
      expect(mocks.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeDocument', () => {
    it('removes a single field', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.deleteMany.mockResolvedValue({ count: 1 });
      const svc = new FullTextSearchAuthService(prisma);
      const n = await svc.removeDocument('tbl', 'rec_1', 'fld_1');
      expect(n).toBe(1);
      expect(mocks.deleteMany).toHaveBeenCalledWith({
        where: { indexId: 'tbl', recordId: 'rec_1:fld_1' },
      });
    });

    it('removes whole record when no field', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.deleteMany.mockResolvedValue({ count: 3 });
      const svc = new FullTextSearchAuthService(prisma);
      const n = await svc.removeDocument('tbl', 'rec_1');
      expect(n).toBe(3);
    });
  });

  describe('getDocument', () => {
    it('returns the parsed document', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(mkRow({ bodyText: 'foo bar' }));
      const svc = new FullTextSearchAuthService(prisma);
      const doc = await svc.getDocument('tbl', 'rec_1', 'fld_1');
      expect(doc.tokens).toContain('foo');
    });

    it('throws NotFound when missing', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findUnique.mockResolvedValue(null);
      const svc = new FullTextSearchAuthService(prisma);
      await expect(svc.getDocument('tbl', 'rec_1', 'fld_1')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('search', () => {
    it('finds matching documents', async () => {
      const { prisma, mocks } = mkPrismaMock();
      mocks.findMany.mockResolvedValue([
        mkRow({ recordId: 'r1:fld_1', bodyText: 'apple banana' }),
        mkRow({ recordId: 'r2:fld_1', bodyText: 'kiwi lime' }),
      ]);
      const svc = new FullTextSearchAuthService(prisma);
      const out = await svc.search({
        tokens: [{ value: 'apple', isPhrase: false }],
        mode: 'and',
      });
      expect(out.total).toBe(1);
      expect(out.hits[0]?.recordId).toBe('r1');
    });

    it('rejects invalid query', async () => {
      const { prisma } = mkPrismaMock();
      const svc = new FullTextSearchAuthService(prisma);
      await expect(svc.search({ tokens: [], mode: 'and' })).rejects.toThrow();
    });
  });

  describe('buildNativeSql', () => {
    it('returns SQL + params', async () => {
      const { prisma } = mkPrismaMock();
      const svc = new FullTextSearchAuthService(prisma);
      const out = await svc.buildNativeSql({
        tokens: [{ value: 'hello', isPhrase: false }],
        mode: 'and',
      });
      expect(out.sql).toContain('to_tsvector');
      expect(out.params[0]).toBe('hello');
    });
  });

  describe('exposed helpers', () => {
    it('shouldIndexField whitelist', () => {
      const { prisma } = mkPrismaMock();
      const svc = new FullTextSearchAuthService(prisma);
      expect(svc.shouldIndexField('text')).toBe(true);
      expect(svc.shouldIndexField('number')).toBe(false);
    });
  });
});
