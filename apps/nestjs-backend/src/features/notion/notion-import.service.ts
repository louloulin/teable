/**
 * Notion import service.
 *
 * Pulls a database (list of pages) from the Notion API and writes the result
 * into an existing Teable `tableId` using the `RecordService.createBatch()`
 * path. Re-uses the schema mapper for property→field conversion so the
 * preview the wizard renders and the actual import use the same logic.
 *
 * Incremental sync: when the controller passes `incremental: true` and the
 * stored envelope already has a `lastEditedTime` cursor, we set the
 * `/v1/databases/{id}/query` filter to that timestamp and update the cursor
 * after each successful batch.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

import { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';
import type { IClsStore } from '../../types/cls';
import {
  notionFetch,
  type INotionDatabaseListItem,
  type INotionDatabaseSchema,
  type INotionPageListItem,
  type INotionPageListResult,
  type INotionPropertySchema,
  type INotionRichText,
} from './notion.types';
import {
  mapNotionDatabaseSchema,
  notionPageToRecord,
  type INotionSchemaMappingResult,
} from './notion-schema-mapper';
import { NotionOAuthService } from './notion-oauth.service';

const QUERY_PAGE_SIZE = 100;
const CREATE_BATCH_SIZE = 100;

interface INotionTokenForImport {
  accessToken: string;
  lastEditedTime?: string;
  workspaceName?: string;
}

interface INotionImportOptions {
  spaceId: string;
  tableId: string;
  databaseId: string;
  /** When true, only pages with `lastEditedTime > since` are imported. */
  incremental?: boolean;
  /** Optional cancel predicate. Checked between pages and between record
   *  batches. Throws `INotionImportCanceledError` when true so callers
   *  can distinguish cancel from genuine failures. */
  isCanceled?: () => boolean | Promise<boolean>;
  /** Optional progress hook. Called after each successful record batch with
   *  cumulative (imported, skipped, total) counts so the task row stays
   *  observable while the import runs. */
  onProgress?: (counts: { imported: number; skipped: number; total: number }) => void | Promise<void>;
}

export class INotionImportCanceledError extends Error {
  readonly code = 'NOTION_IMPORT_CANCELED';
  constructor() {
    super('notion import was canceled');
    this.name = 'INotionImportCanceledError';
  }
}

export interface INotionImportResult {
  imported: number;
  skipped: number;
  lastEditedTime?: string;
}

interface INotionSearchResponse {
  results: Array<{
    id: string;
    object: string;
    title?: INotionRichText[];
    properties?: Record<string, INotionPropertySchema>;
  }>;
}

const richTextToPlain = (segments: INotionRichText[] | undefined | null): string => {
  if (!segments || segments.length === 0) return '';
  return segments.map((segment) => segment.plainText ?? '').join('');
};

@Injectable()
export class NotionImportService {
  private readonly logger = new Logger(NotionImportService.name);

  constructor(
    private readonly oauthService: NotionOAuthService,
    private readonly recordOpenApiV2Service: RecordOpenApiV2Service,
    private readonly cls: ClsService<IClsStore>
  ) {}

  /**
   * List the Notion databases the integration can see. Used by the wizard's
   * step 2 to populate the picker. The token must already be stored for the
   * space — the controller resolves it.
   */
  async listDatabases(spaceId: string): Promise<INotionDatabaseListItem[]> {
    const token = await this.resolveToken(spaceId);
    const response = await notionFetch<INotionSearchResponse>('/search', token.accessToken, {
      method: 'POST',
      body: {
        filter: { value: 'database', property: 'object' },
        page_size: 100,
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
      },
    });
    return (response.results ?? []).map((database) => ({
      id: database.id,
      title: richTextToPlain(database.title),
      properties: (database.properties ?? {}) as Record<string, unknown>,
    }));
  }

  /**
   * Pull a single database (with its raw property descriptors). The wizard
   * step 3 calls this to render the field-mapping preview before the user
   * confirms the import.
   */
  async fetchDatabaseSchema(
    spaceId: string,
    databaseId: string
  ): Promise<INotionSchemaMappingResult> {
    const token = await this.resolveToken(spaceId);
    const database = await notionFetch<{
      id: string;
      title: INotionRichText[];
      properties: Record<string, INotionPropertySchema>;
    }>(`/databases/${databaseId}`, token.accessToken, { method: 'GET' });
    return mapNotionDatabaseSchema({
      id: database.id,
      title: database.title,
      properties: database.properties,
    });
  }

  /**
   * Run the import. Pages are read in batches of 100, then the mapper is
   * applied to produce cell values, which we hand to
   * `RecordService.createBatch` via the v2 open API surface.
   */
  async importDatabase(options: INotionImportOptions): Promise<INotionImportResult> {
    const { spaceId, tableId, databaseId, incremental = false } = options;
    if (!spaceId) throw new BadRequestException('spaceId is required');
    if (!tableId) throw new BadRequestException('tableId is required');
    if (!databaseId) throw new BadRequestException('databaseId is required');

    const token = await this.resolveToken(spaceId);
    const mapping = await this.fetchDatabaseSchema(spaceId, databaseId);

    const since = incremental ? token.lastEditedTime : undefined;
    const allPages: INotionPageListItem[] = [];
    let cursor: string | undefined;
    while (true) {
      if (await options.isCanceled?.()) throw new INotionImportCanceledError();
      const page = await this.queryPages(token.accessToken, databaseId, {
        pageSize: QUERY_PAGE_SIZE,
        startCursor: cursor,
        ...(since
          ? { filter: { lastEditedTime: { after: since } } }
          : {}),
      });
      allPages.push(...page.results);
      if (!page.hasMore || !page.nextCursor) break;
      cursor = page.nextCursor;
    }

    let imported = 0;
    let skipped = 0;
    let maxLastEdited: string | undefined = since;
    for (let i = 0; i < allPages.length; i += CREATE_BATCH_SIZE) {
      if (await options.isCanceled?.()) throw new INotionImportCanceledError();
      const slice = allPages.slice(i, i + CREATE_BATCH_SIZE);
      const payloads = slice
        .map((page) => notionPageToRecord(page, mapping))
        .filter((record) => Object.keys(record.fields).length > 0);
      skipped += slice.length - payloads.length;
      if (payloads.length === 0) {
        continue;
      }
      try {
        await this.recordOpenApiV2Service.createRecords(tableId, {
          fieldKeyType: 'name' as never,
          typecast: true,
          records: payloads.map((record) => ({ fields: record.fields })),
        });
        imported += payloads.length;
        for (const page of slice) {
          if (page.lastEditedTime) {
            if (!maxLastEdited || page.lastEditedTime > maxLastEdited) {
              maxLastEdited = page.lastEditedTime;
            }
          }
        }
        await options.onProgress?.({
          imported,
          skipped,
          total: allPages.length,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to import Notion page batch ${i / CREATE_BATCH_SIZE + 1}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
        skipped += payloads.length;
      }
    }

    if (maxLastEdited) {
      try {
        await this.oauthService.updateLastEditedTime(spaceId, maxLastEdited);
      } catch (error) {
        // A failure to persist the cursor is non-fatal — the next import
        // will re-checkpoint it.
        this.logger.warn(
          `Failed to update notion incremental cursor: ${
            error instanceof Error ? error.message : 'unknown error'
          }`
        );
      }
    }

    const cls = this.cls as unknown as { set(key: string, value: unknown): void };
    cls.set('notionImportResult', {
      imported,
      skipped,
      lastEditedTime: maxLastEdited,
    });
    return { imported, skipped, ...(maxLastEdited ? { lastEditedTime: maxLastEdited } : {}) };
  }

  private async queryPages(
    accessToken: string,
    databaseId: string,
    options: {
      pageSize?: number;
      startCursor?: string;
      filter?: { lastEditedTime?: { after?: string; onOrAfter?: string } };
    } = {}
  ): Promise<INotionPageListResult> {
    const response = await notionFetch<{
      results: Array<{
        id: string;
        last_edited_time: string;
        properties: Record<string, unknown>;
      }>;
      has_more: boolean;
      next_cursor: string | null;
    }>(`/databases/${databaseId}/query`, accessToken, {
      method: 'POST',
      body: {
        page_size: options.pageSize ?? QUERY_PAGE_SIZE,
        ...(options.startCursor ? { start_cursor: options.startCursor } : {}),
        ...(options.filter ? { filter: options.filter } : {}),
      },
    });
    return {
      results: (response.results ?? []).map((page) => ({
        id: page.id,
        lastEditedTime: page.last_edited_time,
        properties: (page.properties ?? {}) as Record<string, unknown>,
      })),
      hasMore: !!response.has_more,
      nextCursor: response.next_cursor ?? null,
    };
  }

  private async resolveToken(spaceId: string): Promise<INotionTokenForImport> {
    const envelope = await this.oauthService.getStoredTokens(spaceId);
    if (!envelope) {
      throw new BadRequestException(
        'No Notion connection found for this space. Connect Notion first.'
      );
    }
    return {
      accessToken: envelope.accessToken,
      lastEditedTime: envelope.lastEditedTime,
      workspaceName: envelope.workspaceName,
    };
  }
}
