import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildDocumentRow,
  buildIndexRow,
  buildSnippet,
  contentHash,
  expandSynonyms,
  indexDocumentRowFromInput,
  isValidLanguage,
  isValidScope,
  isValidStatusTransition,
  runSearch,
  tokenize,
} from './fulltext-search.service';
import type {
  IAddSynonymInput,
  ICreateIndexInput,
  IIndexDocumentInput,
  ISearchDocument,
  ISearchIndex,
  ISearchQueryLog,
  ISearchResult,
  ISearchSynonym,
  IUpdateIndexInput,
  SearchIndexStatus,
  SearchLanguage,
  SearchScope,
} from './fulltext-search.types';

@Injectable()
export class FulltextSearchAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async createIndex(input: ICreateIndexInput): Promise<ISearchIndex> {
    if (input.scope && !isValidScope(input.scope)) throw new BadRequestException('invalid scope');
    if (input.language && !isValidLanguage(input.language))
      throw new BadRequestException('invalid language');
    const dup = await this.prisma.searchIndex.findUnique({
      where: {
        baseId_tableId_scope: {
          baseId: input.baseId,
          tableId: input.tableId,
          scope: input.scope ?? 'row',
        },
      },
    });
    if (dup) throw new ConflictException('index exists');
    const id = `idx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildIndexRow({ id, ...input });
    const created = await this.prisma.searchIndex.create({
      data: {
        id: row.id,
        baseId: row.baseId,
        tableId: row.tableId,
        scope: row.scope,
        status: row.status,
        fieldIdsCsv: row.fieldIdsCsv,
        language: row.language,
        createdBy: row.createdBy,
      },
    });
    return toIndexRow(created);
  }

  async updateIndex(indexId: string, update: IUpdateIndexInput): Promise<ISearchIndex> {
    const existing = await this.prisma.searchIndex.findUnique({ where: { id: indexId } });
    if (!existing) throw new NotFoundException(`index not found: ${indexId}`);
    if (
      update.status &&
      !isValidStatusTransition(existing.status as SearchIndexStatus, update.status)
    ) {
      throw new BadRequestException(
        `invalid status transition: ${existing.status} → ${update.status}`
      );
    }
    if (update.language && !isValidLanguage(update.language))
      throw new BadRequestException('invalid language');
    const updated = await this.prisma.searchIndex.update({
      where: { id: indexId },
      data: {
        status: update.status ?? existing.status,
        fieldIdsCsv: update.fieldIdsCsv !== undefined ? update.fieldIdsCsv : existing.fieldIdsCsv,
        language: update.language ?? existing.language,
        updatedTime: new Date(),
      },
    });
    return toIndexRow(updated);
  }

  async deleteIndex(indexId: string): Promise<void> {
    const existing = await this.prisma.searchIndex.findUnique({ where: { id: indexId } });
    if (!existing) throw new NotFoundException(`index not found: ${indexId}`);
    await this.prisma.searchDocument.deleteMany({ where: { indexId } });
    await this.prisma.searchQueryLog.deleteMany({ where: { indexId } });
    await this.prisma.searchSynonym.deleteMany({ where: { indexId } });
    await this.prisma.searchIndex.delete({ where: { id: indexId } });
  }

  async getIndex(indexId: string): Promise<ISearchIndex | null> {
    const row = await this.prisma.searchIndex.findUnique({ where: { id: indexId } });
    return row ? toIndexRow(row) : null;
  }

  async listIndexes(baseId: string): Promise<ISearchIndex[]> {
    const rows = await this.prisma.searchIndex.findMany({ where: { baseId } });
    return rows.map(toIndexRow);
  }

  async indexDocument(input: IIndexDocumentInput): Promise<ISearchDocument> {
    const idx = await this.prisma.searchIndex.findUnique({ where: { id: input.indexId } });
    if (!idx) throw new NotFoundException(`index not found: ${input.indexId}`);
    if (idx.status === 'paused') throw new BadRequestException('index paused');
    const built = indexDocumentRowFromInput(input);
    const id = `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.searchDocument.upsert({
      where: { indexId_recordId: { indexId: input.indexId, recordId: input.recordId } },
      create: {
        id,
        indexId: built.indexId,
        recordId: built.recordId,
        bodyText: built.bodyText,
        tokens: built.tokens,
        contentHash: built.contentHash,
      },
      update: {
        bodyText: built.bodyText,
        tokens: built.tokens,
        contentHash: built.contentHash,
        lastIndexedAt: new Date(),
      },
    });
    return toDocRow(row);
  }

  async deleteDocument(indexId: string, recordId: string): Promise<void> {
    await this.prisma.searchDocument.deleteMany({ where: { indexId, recordId } });
  }

  async listDocuments(indexId: string, limit = 100): Promise<ISearchDocument[]> {
    const rows = await this.prisma.searchDocument.findMany({
      where: { indexId },
      orderBy: { lastIndexedAt: 'desc' },
      take: Math.min(limit, 5_000),
    });
    return rows.map(toDocRow);
  }

  async search(input: {
    indexId: string;
    queryText: string;
    userId?: string | null;
    limit?: number;
    offset?: number;
  }): Promise<ISearchResult> {
    const idx = await this.prisma.searchIndex.findUnique({ where: { id: input.indexId } });
    if (!idx) throw new NotFoundException(`index not found: ${input.indexId}`);
    if (idx.status !== 'enabled') throw new BadRequestException(`index status: ${idx.status}`);
    const docs = await this.prisma.searchDocument.findMany({ where: { indexId: input.indexId } });
    const synonyms = await this.prisma.searchSynonym.findMany({
      where: { OR: [{ indexId: input.indexId }, { indexId: null }] },
    });
    const result = runSearch({
      indexId: input.indexId,
      queryText: input.queryText,
      userId: input.userId,
      limit: input.limit,
      offset: input.offset,
      documents: docs.map((d) => ({
        recordId: d.recordId,
        body: d.bodyText,
        tokens: d.tokens.split(' ').filter((t) => t.length > 0),
      })),
      synonyms: synonyms.map(toSynonymRow),
    });
    await this.recordQuery({
      indexId: input.indexId,
      userId: input.userId ?? null,
      queryText: input.queryText,
      hitCount: result.total,
      durationMs: result.durationMs,
    });
    return result;
  }

  async recordQuery(input: {
    indexId: string;
    userId: string | null;
    queryText: string;
    hitCount: number;
    durationMs: number;
  }): Promise<ISearchQueryLog> {
    const id = `qlog_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.searchQueryLog.create({
      data: {
        id,
        indexId: input.indexId,
        userId: input.userId,
        queryText: input.queryText,
        hitCount: input.hitCount,
        durationMs: input.durationMs,
      },
    });
    return toQueryLogRow(row);
  }

  async addSynonym(input: IAddSynonymInput): Promise<ISearchSynonym> {
    if (input.term.trim().length === 0) throw new BadRequestException('term required');
    if (input.synonyms.length === 0) throw new BadRequestException('at least one synonym required');
    const dup = await this.prisma.searchSynonym.findFirst({
      where: { indexId: input.indexId ?? null, term: input.term },
    });
    if (dup) throw new ConflictException('synonym exists');
    const id = `syn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.searchSynonym.create({
      data: {
        id,
        indexId: input.indexId ?? null,
        term: input.term,
        synonymsCsv: input.synonyms.join(','),
        createdBy: input.createdBy,
      },
    });
    return toSynonymRow(row);
  }

  async listSynonyms(indexId: string): Promise<ISearchSynonym[]> {
    const rows = await this.prisma.searchSynonym.findMany({
      where: { OR: [{ indexId }, { indexId: null }] },
    });
    return rows.map(toSynonymRow);
  }

  async deleteSynonym(synonymId: string): Promise<void> {
    await this.prisma.searchSynonym.delete({ where: { id: synonymId } });
  }

  tokenize(s: string): string[] {
    return tokenize(s);
  }

  expandSynonyms(input: { query: string; synonyms: ReadonlyArray<ISearchSynonym> }): string[] {
    return expandSynonyms(input);
  }

  buildSnippet(input: { body: string; queryTerms: ReadonlyArray<string> }): string {
    return buildSnippet(input);
  }

  contentHash(fields: ReadonlyArray<{ fieldId: string; value: string | null }>): string {
    return contentHash(fields);
  }
}

function toIndexRow(r: {
  id: string;
  baseId: string;
  tableId: string;
  scope: string;
  status: string;
  fieldIdsCsv: string | null;
  language: string;
  lastBuiltAt: Date | null;
  documentCount: number;
  bytesUsed: bigint;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}): ISearchIndex {
  return {
    id: r.id,
    baseId: r.baseId,
    tableId: r.tableId,
    scope: r.scope as SearchScope,
    status: r.status as SearchIndexStatus,
    fieldIdsCsv: r.fieldIdsCsv,
    language: r.language as SearchLanguage,
    lastBuiltAt: r.lastBuiltAt,
    documentCount: r.documentCount,
    bytesUsed: r.bytesUsed,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toDocRow(r: {
  id: string;
  indexId: string;
  recordId: string;
  bodyText: string;
  tokens: string;
  contentHash: string;
  lastIndexedAt: Date;
}): ISearchDocument {
  return {
    id: r.id,
    indexId: r.indexId,
    recordId: r.recordId,
    bodyText: r.bodyText,
    tokens: r.tokens,
    contentHash: r.contentHash,
    lastIndexedAt: r.lastIndexedAt,
  };
}

function toQueryLogRow(r: {
  id: string;
  indexId: string;
  userId: string | null;
  queryText: string;
  hitCount: number;
  durationMs: number;
  occurredAt: Date;
}): ISearchQueryLog {
  return {
    id: r.id,
    indexId: r.indexId,
    userId: r.userId,
    queryText: r.queryText,
    hitCount: r.hitCount,
    durationMs: r.durationMs,
    occurredAt: r.occurredAt,
  };
}

function toSynonymRow(r: {
  id: string;
  indexId: string | null;
  term: string;
  synonymsCsv: string;
  createdBy: string;
  createdTime: Date;
}): ISearchSynonym {
  return {
    id: r.id,
    indexId: r.indexId,
    term: r.term,
    synonymsCsv: r.synonymsCsv,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
  };
}
