import { Injectable, Logger } from '@nestjs/common';
import { FieldKeyType } from '@teable/core';
import { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';
import { MondayApiClient } from './monday-api.client';
import type {
  MondayBoard,
  MondayConnectionProbe,
  MondayItem,
  MondayWorkspace,
} from './monday-import.types';

/**
 * Round-19: Monday.com migration driver (minimal). Mirrors baserow (R16) +
 * clickup (R17) + jira (R18) pattern. Monday is GraphQL-based vs REST for the
 * others — only the API client differs. Service + controller + module are
 * structurally identical.
 *
 * Round-39: adds `listAllItems` (cursor pagination + cancel guards) +
 * `importTable` (record-creation path via
 * `recordOpenApiV2Service.createRecords` in 100-row batches with cancel
 * + progress hooks). Mirrors the NocoDB / Baserow / Jira driver shape so
 * the source-driver pattern stays uniform across REST + GraphQL sources.
 */
@Injectable()
export class MondayImportService {
  private readonly logger = new Logger(MondayImportService.name);

  constructor(private readonly records: RecordOpenApiV2Service) {}

  probe(token: string): Promise<MondayConnectionProbe> {
    const client = new MondayApiClient(token);
    return client.probe().then((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listWorkspaces(token: string): Promise<MondayWorkspace[]> {
    return new MondayApiClient(token).listWorkspaces();
  }

  async listBoards(token: string, limit = 25): Promise<MondayBoard[]> {
    return new MondayApiClient(token).listBoards(limit);
  }

  /**
   * Lightweight pre-flight: returns itemCount + 5-item sample so the
   * source driver can confirm connectivity + data shape before
   * committing to a full migration. The full record-creation path
   * uses `listAllItems` instead.
   */
  async fetchItems(
    token: string,
    boardId: string,
    limit = 100
  ): Promise<{ boardId: string; itemCount: number; sample: MondayItem[] }> {
    const { items } = await new MondayApiClient(token).listItems(boardId, limit);
    return {
      boardId,
      itemCount: items.length,
      sample: items.slice(0, 5),
    };
  }

  /**
   * Round-39: full paginated item fetch used by the record-creation
   * path. Honors `isCanceled()` between pages; throws
   * `IMondayImportCanceledError` (code `MONDAY_CANCELED`) when the
   * predicate fires so the processor can reconcile the final state
   * without counting the partial run as a failure.
   *
   * Capped at 500 pages to keep the durable task bounded.
   */
  async listAllItems(
    token: string,
    boardId: string,
    pageSize = 100,
    isCanceled: () => boolean = () => false,
    onPage?: (counts: { fetched: number }) => void
  ): Promise<MondayItem[]> {
    const client = new MondayApiClient(token);
    const collected: MondayItem[] = [];
    let cursor: string | undefined = undefined;
    const MAX_PAGES = 500;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      if (isCanceled()) {
        throw new IMondayImportCanceledError();
      }
      const { items, nextCursor } = await client.listItems(boardId, pageSize, cursor);
      if (items.length === 0) break;
      collected.push(...items);
      onPage?.({ fetched: collected.length });
      if (!nextCursor || items.length < pageSize) break;
      cursor = nextCursor;
    }
    if (isCanceled()) {
      throw new IMondayImportCanceledError();
    }
    return collected;
  }

  /**
   * Round-39 record-creation path. Fetches every page of items,
   * converts each item to a Teable field dict, and writes them in
   * `batchSize` chunks via `recordOpenApiV2Service.createRecords`.
   *
   * `mapItemToFields` is injected so the unit spec can drive the
   * mapper without coupling to the driver's mapping function.
   */
  async importTable(input: {
    apiToken: string;
    boardId: string;
    destinationTableId: string;
    pageSize?: number;
    batchSize?: number;
    isCanceled: () => boolean;
    onProgress?: (counts: {
      processedCount: number;
      failedCount: number;
      totalCount: number;
    }) => void | Promise<void>;
    mapItemToFields: (item: Record<string, unknown>) => Record<string, unknown>;
  }): Promise<{
    processedCount: number;
    failedCount: number;
    totalCount: number;
  }> {
    const pageSize = input.pageSize ?? 100;
    const batchSize = Math.min(
      Math.max(1, input.batchSize ?? 100),
      1000
    );

    let totalSeen = 0;
    const items = await this.listAllItems(
      input.apiToken,
      input.boardId,
      pageSize,
      input.isCanceled,
      ({ fetched }) => {
        totalSeen = fetched;
      }
    );

    let processedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      if (input.isCanceled()) {
        throw new IMondayImportCanceledError();
      }
      const chunk = items.slice(i, i + batchSize);
      const records = chunk.map((item) => ({
        fields: input.mapItemToFields(item as unknown as Record<string, unknown>),
      }));
      if (records.length === 0) continue;
      try {
        await this.records.createRecords(input.destinationTableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: true,
          records,
        });
        processedCount += records.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `monday import batch failed at offset=${i} destTableId=${input.destinationTableId}: ${message}`
        );
        failedCount += records.length;
      }
      await input.onProgress?.({
        processedCount,
        failedCount,
        totalCount: totalSeen,
      });
    }

    if (input.isCanceled()) {
      throw new IMondayImportCanceledError();
    }

    return {
      processedCount,
      failedCount,
      totalCount: totalSeen,
    };
  }
}

/**
 * Round-39: thrown by `listAllItems` / `importTable` when the cancel
 * predicate fires mid-pagination. Matches the
 * `IAirtableImportCanceledError` / `INocoDbImportCanceledError` /
 * `IBaserowImportCanceledError` / `IJiraImportCanceledError` pattern;
 * the processor maps the `code` to a no-op success (via
 * `KNOWN_CANCEL_CODES`).
 */
export class IMondayImportCanceledError extends Error {
  readonly code = 'MONDAY_CANCELED';
  constructor() {
    super('monday import was canceled');
    this.name = 'IMondayImportCanceledError';
  }
}
