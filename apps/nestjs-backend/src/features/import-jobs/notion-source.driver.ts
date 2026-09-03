/**
 * Notion adapter for the unified source-import driver.
 *
 * Wraps the existing `NotionImportService.importDatabase` loop in the
 * driver contract. The driver is the integration boundary: it resolves
 * the Notion OAuth token, maps Notion pages to Teable cells, and writes
 * them via the v2 record open-api in batches. Cancel + progress hooks
 * are wired back through to the task service so the durable-task row
 * stays consistent while the migration runs.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  type ISourceImportDriver,
  type ISourceImportRunInput,
  type ISourceImportRunResult,
} from './source-import.driver';
import { NotionImportService } from '../notion/notion-import.service';
import {
  type ISourceImportBatch,
  type ISourceImportDriverContext,
} from './source-import.driver';
import { NotionOAuthService } from '../notion/notion-oauth.service';
import {
  notionFetch,
  type INotionPageListItem,
  type INotionPropertySchema,
} from '../notion/notion.types';
import { mapNotionDatabaseSchema, notionPageToRecord } from '../notion/notion-schema-mapper';

interface INotionQueryResponse {
  results: Array<{
    id: string;
    last_edited_time: string;
    properties: Record<string, unknown>;
  }>;
  has_more: boolean;
  next_cursor: string | null;
}

const PAGE_SIZE = 100;

@Injectable()
export class NotionSourceDriver implements ISourceImportDriver {
  readonly source = 'notion' as const;
  private readonly logger = new Logger(NotionSourceDriver.name);

  constructor(
    private readonly importService: NotionImportService,
    private readonly oauthService: NotionOAuthService
  ) {}

  /** Used by the legacy wizard (not by the unified processor). */
  async listDatabases(input: { spaceId: string; accessToken: string }): Promise<unknown[]> {
    const response = await notionFetch<{
      results: Array<{
        id: string;
        title?: Array<{ plain_text?: string }>;
        properties?: Record<string, INotionPropertySchema>;
      }>;
    }>('/search', input.accessToken, {
      method: 'POST',
      body: { filter: { value: 'database', property: 'object' }, page_size: 100 },
    });
    return (response.results ?? []).map((database) => ({
      id: database.id,
      title: (database.title ?? []).map((segment) => segment.plain_text ?? '').join(''),
      properties: database.properties ?? {},
    }));
  }

  /**
   * Executes the entire migration for one task. Cancellation is honored
   * between pages and between record batches; progress is reported after
   * each successful record batch so the task row stays observable.
   */
  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    if (!input.task.spaceId || !input.task.tableId || !input.task.remoteId) {
      throw new Error('notion import requires spaceId, tableId, and remoteId');
    }
    // Verify a Notion token is stored for this space up-front so the
    // durable-task row gets a clear NO_TOKEN error instead of a generic
    // Notion API 401 after we've queued thousands of pages.
    const storedToken = await this.oauthService.getStoredTokens(input.task.spaceId);
    if (!storedToken) {
      throw new Error(`no notion token stored for space ${input.task.spaceId}`);
    }
    const result = await this.importService.importDatabase({
      spaceId: input.task.spaceId,
      tableId: input.task.tableId,
      databaseId: input.task.remoteId,
      incremental: Boolean(input.task.incremental),
      isCanceled: input.isCanceled,
      onProgress: async ({ imported, skipped, total }) => {
        await input.onProgress?.({
          processedCount: imported,
          failedCount: skipped,
          totalCount: total,
        });
      },
    });
    this.logger.log(
      `notion import ${input.task.id} done: imported=${result.imported} skipped=${result.skipped}` +
        (result.lastEditedTime ? ` cursor=${result.lastEditedTime}` : '')
    );
    return {
      processedCount: result.imported,
      failedCount: result.skipped,
      totalCount: result.imported + result.skipped,
      result,
    };
  }

  /** Convenience accessor for the OAuth service used to resolve tokens. */
  getOAuth(): NotionOAuthService {
    return this.oauthService;
  }

  /**
   * Diagnostics-only batched fetch. Kept as a public helper for ad-hoc
   * tooling; the unified processor never calls it directly because
   * `runImport` owns the full loop.
   */
  async fetchBatch(input: {
    spaceId: string;
    tableId: string;
    remoteId: string;
    context: ISourceImportDriverContext;
  }): Promise<ISourceImportBatch> {
    const mapping = await this.importService.fetchDatabaseSchema(input.spaceId, input.remoteId);
    const body: Record<string, unknown> = { page_size: PAGE_SIZE };
    if (input.context.cursor) body['start_cursor'] = input.context.cursor;
    if (input.context.incremental && input.context.cursor) {
      body['filter'] = { lastEditedTime: { after: input.context.cursor } };
    }
    const response = await notionFetch<INotionQueryResponse>(
      `/databases/${input.remoteId}/query`,
      input.context.accessToken,
      { method: 'POST', body }
    );
    const records = (response.results ?? []).flatMap((page) => {
      const item: INotionPageListItem = {
        id: page.id,
        lastEditedTime: page.last_edited_time,
        properties: page.properties as Record<string, INotionPropertySchema>,
      };
      const record = notionPageToRecord(item, mapping);
      return Object.keys(record.fields).length > 0 ? [record] : [];
    });
    return {
      records,
      nextCursor: response.next_cursor ?? undefined,
      progress: {
        processedThisBatch: records.length,
        hasMore: !!response.has_more,
      },
    };
  }
}
