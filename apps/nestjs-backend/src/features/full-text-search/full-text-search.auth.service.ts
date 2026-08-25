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
} from './full-text-search.types';

interface IMockIndexRow {
  id: string;
  tableId: string;
  recordId: string;
  fieldId: string;
  text: string;
  indexedAt: Date;
}

@Injectable()
export class FullTextSearchAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async indexDocument(input: IIndexDocumentInput): Promise<IIndexedDocument> {
    const doc = buildIndexedDocument(input);
    await this.prisma.searchIndex.upsert({
      where: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        tableId_recordId_fieldId: {
          tableId: input.tableId,
          recordId: input.recordId,
          fieldId: input.fieldId,
        },
      },
      create: {
        tableId: input.tableId,
        recordId: input.recordId,
        fieldId: input.fieldId,
        text: input.text,
        indexedAt: doc.indexedAt,
      },
      update: {
        text: input.text,
        indexedAt: doc.indexedAt,
      },
    });
    return doc;
  }

  async removeDocument(tableId: string, recordId: string, fieldId?: string): Promise<number> {
    if (fieldId) {
      await this.prisma.searchIndex.deleteMany({
        where: { tableId, recordId, fieldId },
      });
      return 1;
    }
    const res = await this.prisma.searchIndex.deleteMany({ where: { tableId, recordId } });
    return res.count;
  }

  async getDocument(tableId: string, recordId: string, fieldId: string): Promise<IIndexedDocument> {
    const row = await this.prisma.searchIndex.findUnique({
      where: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        tableId_recordId_fieldId: { tableId, recordId, fieldId },
      },
    });
    if (!row) throw new NotFoundException(`indexed doc not found`);
    return buildIndexedDocument({
      tableId: row.tableId,
      recordId: row.recordId,
      fieldId: row.fieldId,
      text: row.text,
    });
  }

  async search(rawQuery: Partial<ISearchQuery>): Promise<ISearchResult> {
    const query = normalizeQuery(rawQuery);
    validateQuery(query);
    if (query.tableId) {
      const rows = await this.prisma.searchIndex.findMany({ where: { tableId: query.tableId } });
      return searchDocuments(rows.map(toDoc), query);
    }
    const rows = await this.prisma.searchIndex.findMany();
    return searchDocuments(rows.map(toDoc), query);
  }

  async buildNativeSql(
    rawQuery: Partial<ISearchQuery>
  ): Promise<{ sql: string; params: string[] }> {
    const query = normalizeQuery(rawQuery);
    validateQuery(query);
    return buildSearchQuery({ query, schema: 'public', indexTable: 'search_index' });
  }

  shouldIndexField = shouldIndexField;
}

function toDoc(r: IMockIndexRow): IIndexedDocument {
  return buildIndexedDocument({
    tableId: r.tableId,
    recordId: r.recordId,
    fieldId: r.fieldId,
    text: r.text,
  });
}
