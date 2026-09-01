import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildIndexedDocument,
  buildSearchQuery,
  normalizeQuery,
  searchDocuments,
  shouldIndexField,
  validateQuery,
} from './full-text-search.service';
import type {
  IIndexDocumentInput,
  IIndexedDocument,
  ISearchQuery,
  ISearchResult,
  ISearchToken,
} from './full-text-search.types';

interface ISearchDocumentRow {
  id: string;
  indexId: string;
  recordId: string;
  bodyText: string;
  tokens: string;
}

@Injectable()
export class FullTextSearchAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async indexDocument(input: IIndexDocumentInput): Promise<IIndexedDocument> {
    const doc = buildIndexedDocument(input);
    const indexId = input.tableId;
    const documentId = `${input.recordId}:${input.fieldId}`;
    await this.prisma.searchDocument.upsert({
      where: { indexId_recordId: { indexId, recordId: documentId } },
      create: {
        id: `fts_${indexId}_${input.recordId}_${input.fieldId}`,
        indexId,
        recordId: documentId,
        bodyText: input.text,
        tokens: doc.tokens.join(' '),
        contentHash: doc.tokens.join('|'),
      },
      update: {
        bodyText: input.text,
        tokens: doc.tokens.join(' '),
        contentHash: doc.tokens.join('|'),
      },
    });
    return doc;
  }

  async removeDocument(tableId: string, recordId: string, fieldId?: string): Promise<number> {
    if (fieldId) {
      await this.prisma.searchDocument.deleteMany({
        where: { indexId: tableId, recordId: `${recordId}:${fieldId}` },
      });
      return 1;
    }
    const res = await this.prisma.searchDocument.deleteMany({
      where: { indexId: tableId, recordId: { startsWith: `${recordId}:` } },
    });
    return res.count;
  }

  async getDocument(tableId: string, recordId: string, fieldId: string): Promise<IIndexedDocument> {
    const row = await this.prisma.searchDocument.findUnique({
      where: { indexId_recordId: { indexId: tableId, recordId: `${recordId}:${fieldId}` } },
    });
    if (!row) throw new NotFoundException(`indexed doc not found`);
    return buildIndexedDocument({
      tableId,
      recordId,
      fieldId,
      text: row.bodyText,
    });
  }

  async search(rawQuery: Partial<ISearchQuery>): Promise<ISearchResult> {
    const query = normalizeQuery(rawQuery as Partial<ISearchQuery> & { tokens?: ISearchToken[] });
    validateQuery(query);
    const rows = await this.prisma.searchDocument.findMany({
      where: query.tableId ? { indexId: query.tableId } : undefined,
    });
    return searchDocuments(rows.map(toDoc), query);
  }

  async buildNativeSql(
    rawQuery: Partial<ISearchQuery>
  ): Promise<{ sql: string; params: string[] }> {
    const query = normalizeQuery(rawQuery as Partial<ISearchQuery> & { tokens?: ISearchToken[] });
    validateQuery(query);
    return buildSearchQuery({ query, schema: 'public', indexTable: 'search_index' });
  }

  shouldIndexField = shouldIndexField;

  /**
   * Snapshot of the search index for an optional table. Used by the admin
   * panel to show "is indexing healthy / how big is it".
   */
  async indexStatus(tableId?: string): Promise<{
    tableId: string | null;
    documentCount: number;
    distinctFields: number;
    indexTables: number;
  }> {
    const where = tableId ? { indexId: tableId } : undefined;
    const [documentCount, distinctFields, indexTables] = await Promise.all([
      this.prisma.searchDocument.count({ where }),
      this.prisma.searchDocument
        .findMany({
          where,
          select: { recordId: true },
        })
        .then((rows: Array<{ recordId: string }>) => {
          const set = new Set<string>();
          for (const r of rows) {
            const sep = r.recordId.lastIndexOf(':');
            set.add(sep > 0 ? r.recordId.slice(sep + 1) : r.recordId);
          }
          return set.size;
        }),
      this.prisma.searchDocument
        .findMany({ select: { indexId: true }, distinct: ['indexId'] })
        .then((rows: Array<{ indexId: string }>) => rows.length),
    ]);
    return { tableId: tableId ?? null, documentCount, distinctFields, indexTables };
  }
}

function toDoc(r: ISearchDocumentRow): IIndexedDocument {
  const separator = r.recordId.lastIndexOf(':');
  return buildIndexedDocument({
    tableId: r.indexId,
    recordId: separator > 0 ? r.recordId.slice(0, separator) : r.recordId,
    fieldId: separator > 0 ? r.recordId.slice(separator + 1) : '',
    text: r.bodyText,
  });
}
