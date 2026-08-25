/* eslint-disable @typescript-eslint/naming-convention */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { vi } from 'vitest';

import { FulltextSearchAuthService } from './fulltext-search.auth.service';

interface IMockIndexTable {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockDocumentTable {
  upsert: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockQueryLogTable {
  create: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockSynonymTable {
  create: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  deleteMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  searchIndex: IMockIndexTable;
  searchDocument: IMockDocumentTable;
  searchQueryLog: IMockQueryLogTable;
  searchSynonym: IMockSynonymTable;
}

const now = new Date('2026-08-25T00:00:00Z');

const buildPrisma = (): IMockPrisma => ({
  searchIndex: {
    create: vi.fn(async ({ data }) => ({
      ...data,
      status: 'enabled',
      lastBuiltAt: null,
      documentCount: 0,
      bytesUsed: BigInt(0),
      createdTime: now,
      updatedTime: now,
    })),
    update: vi.fn(async ({ where, data }) => ({ ...where, ...data, updatedTime: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    delete: vi.fn(async () => null),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  searchDocument: {
    upsert: vi.fn(async ({ create }) => ({ ...create, lastIndexedAt: now })),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  searchQueryLog: {
    create: vi.fn(async ({ data }) => ({ ...data, occurredAt: now })),
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  searchSynonym: {
    create: vi.fn(async ({ data }) => ({ ...data, createdTime: now })),
    findUnique: vi.fn(async () => null),
    findMany: vi.fn(async () => []),
    delete: vi.fn(async () => null),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
});

describe('FulltextSearchAuthService (Stage 42)', () => {
  let prisma: IMockPrisma;
  let svc: FulltextSearchAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new FulltextSearchAuthService(prisma as never);
  });

  describe('createIndex', () => {
    it('creates an index', async () => {
      const idx = await svc.createIndex({ baseId: 'b', tableId: 't', createdBy: 'u' });
      expect(idx.scope).toBe('row');
      expect(idx.status).toBe('enabled');
    });

    it('rejects invalid scope', async () => {
      await expect(
        svc.createIndex({ baseId: 'b', tableId: 't', scope: 'posts' as never, createdBy: 'u' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate', async () => {
      prisma.searchIndex.findUnique.mockResolvedValueOnce({ id: 'dup' });
      await expect(
        svc.createIndex({ baseId: 'b', tableId: 't', createdBy: 'u' })
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('updateIndex / deleteIndex', () => {
    it('updates status', async () => {
      prisma.searchIndex.findUnique.mockResolvedValueOnce({
        id: 'i',
        baseId: 'b',
        tableId: 't',
        scope: 'row',
        status: 'enabled',
        fieldIdsCsv: null,
        language: 'english',
        lastBuiltAt: null,
        documentCount: 0,
        bytesUsed: BigInt(0),
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      const out = await svc.updateIndex('i', { status: 'paused' });
      expect(out.status).toBe('paused');
    });

    it('rejects invalid transition', async () => {
      prisma.searchIndex.findUnique.mockResolvedValueOnce({
        id: 'i',
        baseId: 'b',
        tableId: 't',
        scope: 'row',
        status: 'enabled',
        fieldIdsCsv: null,
        language: 'english',
        lastBuiltAt: null,
        documentCount: 0,
        bytesUsed: BigInt(0),
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      await expect(svc.updateIndex('i', { status: 'enabled' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });

    it('throws on missing', async () => {
      await expect(svc.updateIndex('missing', { status: 'paused' })).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('deleteIndex cascades', async () => {
      prisma.searchIndex.findUnique.mockResolvedValueOnce({ id: 'i' });
      await svc.deleteIndex('i');
      expect(prisma.searchDocument.deleteMany).toHaveBeenCalled();
      expect(prisma.searchQueryLog.deleteMany).toHaveBeenCalled();
      expect(prisma.searchSynonym.deleteMany).toHaveBeenCalled();
    });
  });

  describe('indexDocument / search', () => {
    it('indexes a document', async () => {
      prisma.searchIndex.findUnique.mockResolvedValueOnce({
        id: 'i',
        baseId: 'b',
        tableId: 't',
        scope: 'row',
        status: 'enabled',
        fieldIdsCsv: null,
        language: 'english',
        lastBuiltAt: null,
        documentCount: 0,
        bytesUsed: BigInt(0),
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      const doc = await svc.indexDocument({
        indexId: 'i',
        recordId: 'r1',
        fields: [{ fieldId: 'k', value: 'hello world' }],
      });
      expect(doc.recordId).toBe('r1');
    });

    it('rejects indexing into paused index', async () => {
      prisma.searchIndex.findUnique.mockResolvedValueOnce({
        id: 'i',
        baseId: 'b',
        tableId: 't',
        scope: 'row',
        status: 'paused',
        fieldIdsCsv: null,
        language: 'english',
        lastBuiltAt: null,
        documentCount: 0,
        bytesUsed: BigInt(0),
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      await expect(
        svc.indexDocument({ indexId: 'i', recordId: 'r', fields: [{ fieldId: 'k', value: 'x' }] })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('search returns hits + records query log', async () => {
      prisma.searchIndex.findUnique.mockResolvedValueOnce({
        id: 'i',
        baseId: 'b',
        tableId: 't',
        scope: 'row',
        status: 'enabled',
        fieldIdsCsv: null,
        language: 'english',
        lastBuiltAt: null,
        documentCount: 1,
        bytesUsed: BigInt(0),
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      prisma.searchDocument.findMany.mockResolvedValueOnce([
        {
          id: 'd1',
          indexId: 'i',
          recordId: 'r1',
          bodyText: 'hello world',
          tokens: 'hello world',
          contentHash: 'h',
          lastIndexedAt: now,
        },
      ]);
      const r = await svc.search({ indexId: 'i', queryText: 'hello' });
      expect(r.hits.length).toBeGreaterThanOrEqual(1);
      expect(prisma.searchQueryLog.create).toHaveBeenCalled();
    });

    it('search rejects missing index', async () => {
      await expect(svc.search({ indexId: 'missing', queryText: 'x' })).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('search rejects paused index', async () => {
      prisma.searchIndex.findUnique.mockResolvedValueOnce({
        id: 'i',
        baseId: 'b',
        tableId: 't',
        scope: 'row',
        status: 'paused',
        fieldIdsCsv: null,
        language: 'english',
        lastBuiltAt: null,
        documentCount: 0,
        bytesUsed: BigInt(0),
        createdBy: 'u',
        createdTime: now,
        updatedTime: now,
      });
      await expect(svc.search({ indexId: 'i', queryText: 'x' })).rejects.toBeInstanceOf(
        BadRequestException
      );
    });
  });

  describe('addSynonym / listSynonyms', () => {
    it('adds a synonym', async () => {
      const s = await svc.addSynonym({
        indexId: null,
        term: 'fast',
        synonyms: ['quick', 'rapid'],
        createdBy: 'u',
      });
      expect(s.term).toBe('fast');
    });

    it('rejects empty synonyms', async () => {
      await expect(
        svc.addSynonym({ term: 'x', synonyms: [], createdBy: 'u' })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate', async () => {
      prisma.searchSynonym.findUnique.mockResolvedValueOnce({ id: 'x' });
      await expect(
        svc.addSynonym({ term: 'x', synonyms: ['y'], createdBy: 'u' })
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('pure-helper passthroughs', () => {
    it('tokenize delegates', () => {
      expect(svc.tokenize('The quick brown fox')).toEqual(['quick', 'brown', 'fox']);
    });

    it('contentHash delegates', () => {
      expect(svc.contentHash([{ fieldId: 'k', value: 'v' }])).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
