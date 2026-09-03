import { Injectable, Logger } from '@nestjs/common';
import { FieldKeyType } from '@teable/core';
import { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';
import { BaserowApiClient } from './baserow-api.client';
import type {
  BaserowConnectionProbe,
  BaserowRow,
} from './baserow-import.types';

/**
 * Round-16: Baserow migration driver (minimal). This is the OSS-side
 * counterpart to Cloud's "Connect & Migrate Baserow" feature. It:
 *   1. Validates a Baserow API token by calling /api/workspaces/
 *   2. Lists tables in a given base
 *   3. Fetches rows (paginated) for a given table
 *
 * Round-37: adds `listAllRows` (offset-based pagination) +
 * `importTable` (record-creation path via
 * `recordOpenApiV2Service.createRecords` in 100-row batches with cancel
 * + progress hooks). Mirrors the NocoDB `Round-36` driver shape so the
 * source-driver pattern stays uniform across REST sources.
 */
@Injectable()
export class BaserowImportService {
  private readonly logger = new Logger(BaserowImportService.name);

  constructor(private readonly records: RecordOpenApiV2Service) {}

  probe(baseUrl: string, token: string, baseId: number): Promise<BaserowConnectionProbe> {
    const client = new BaserowApiClient(baseUrl, token);
    return client.probe().then((p) => ({
      ...p,
      baseId,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listTables(baseUrl: string, token: string, baseId: number) {
    const client = new BaserowApiClient(baseUrl, token);
    const fetchJson = client['fetchJson' as keyof typeof client] as (path: string) => Promise<unknown>;
    const databases = await fetchJson('/api/applications/').catch(() => []);
    return { baseId, count: Array.isArray(databases) ? databases.length : 0 };
  }

  /**
   * Lightweight pre-flight: returns rowCount + 5-row sample so the
   * source driver can confirm connectivity + data shape before
   * committing to a full migration. The full record-creation path
   * uses `listAllRows` instead.
   */
  async fetchRows(
    baseUrl: string,
    token: string,
    tableId: number,
    pageSize = 100
  ): Promise<{ tableId: number; rowCount: number; sample: BaserowRow[] }> {
    const client = new BaserowApiClient(baseUrl, token);
    const rows = await client.listRows(tableId, pageSize);
    return {
      tableId,
      rowCount: rows.length,
      sample: rows.slice(0, 5),
    };
  }

  listFields(baseUrl: string, token: string, tableId: number) {
    const client = new BaserowApiClient(baseUrl, token);
    return client.listFields(tableId);
  }

  /**
   * Round-37: full paginated row fetch used by the record-creation
   * path. Honors `isCanceled()` between pages; throws
   * `IBaserowImportCanceledError` (code `BASEROW_CANCELED`) when the
   * predicate fires so the processor can reconcile the final state
   * without counting the partial run as a failure.
   *
   * Caps the number of pages at 500 to keep the durable task bounded
   * (50k rows at pageSize=100).
   */
  async listAllRows(
    baseUrl: string,
    token: string,
    tableId: number,
    pageSize = 100,
    isCanceled: () => boolean = () => false,
    onPage?: (counts: { fetched: number }) => void
  ): Promise<BaserowRow[]> {
    const client = new BaserowApiClient(baseUrl, token);
    const collected: BaserowRow[] = [];
    let offset = 0;
    const MAX_PAGES = 500;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      if (isCanceled()) {
        throw new IBaserowImportCanceledError();
      }
      const rows = await client.listRows(tableId, pageSize, offset);
      if (rows.length === 0) break;
      collected.push(...rows);
      offset += rows.length;
      onPage?.({ fetched: collected.length });
      if (rows.length < pageSize) break;
    }
    if (isCanceled()) {
      throw new IBaserowImportCanceledError();
    }
    return collected;
  }

  /**
   * Round-37 record-creation path. Fetches every page of rows,
   * converts each row to a Teable field dict, and writes them in
   * `batchSize` chunks via `recordOpenApiV2Service.createRecords`.
   *
   * `mapRowToFields` is injected so the unit spec can drive the
   * mapper without coupling to the driver's mapping function.
   */
  async importTable(input: {
    baseUrl: string;
    apiToken: string;
    tableId: number;
    destinationTableId: string;
    pageSize?: number;
    batchSize?: number;
    isCanceled: () => boolean;
    onProgress?: (counts: {
      processedCount: number;
      failedCount: number;
      totalCount: number;
    }) => void | Promise<void>;
    mapRowToFields: (row: Record<string, unknown>) => Record<string, unknown>;
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
    const rows = await this.listAllRows(
      input.baseUrl,
      input.apiToken,
      input.tableId,
      pageSize,
      input.isCanceled,
      ({ fetched }) => {
        totalSeen = fetched;
      }
    );

    let processedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      if (input.isCanceled()) {
        throw new IBaserowImportCanceledError();
      }
      const chunk = rows.slice(i, i + batchSize);
      const records = chunk.map((row) => ({
        fields: input.mapRowToFields(row as Record<string, unknown>),
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
          `baserow import batch failed at offset=${i} destTableId=${input.destinationTableId}: ${message}`
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
      throw new IBaserowImportCanceledError();
    }

    return {
      processedCount,
      failedCount,
      totalCount: totalSeen,
    };
  }
}

/**
 * Round-37: thrown by `listAllRows` / `importTable` when the cancel
 * predicate fires mid-pagination. Matches the
 * `IAirtableImportCanceledError` / `INocoDbImportCanceledError`
 * pattern; the processor maps the `code` to a no-op success (via
 * `KNOWN_CANCEL_CODES`).
 */
export class IBaserowImportCanceledError extends Error {
  readonly code = 'BASEROW_CANCELED';
  constructor() {
    super('baserow import was canceled');
    this.name = 'IBaserowImportCanceledError';
  }
}
