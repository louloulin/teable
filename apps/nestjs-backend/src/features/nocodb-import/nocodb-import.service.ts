import { Injectable, Logger } from '@nestjs/common';
import { FieldKeyType } from '@teable/core';
import { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';
import { NocoDbApiClient } from './nocodb-api.client';
import type {
  NocoDbBase,
  NocoDbConnectionProbe,
  NocoDbRow,
  NocoDbTable,
} from './nocodb-import.types';

/**
 * Round-20: NocoDB migration driver (minimal). Mirrors baserow (R16) +
 * clickup (R17) + jira (R18) + monday (R19) pattern. NocoDB is REST-based
 * with two API versions (v1 metadata, v2 rows) and xc-token auth.
 *
 * Round-36: adds `listAllRows` for full paginated row fetch +
 * `importTable` for the record-creation path (batched
 * `recordOpenApiV2Service.createRecords` writes). Keeps `fetchRows`
 * as the lightweight pre-flight probe.
 *
 * Provides:
 *   1. Credential probe — list bases + sample table count
 *   2. List bases
 *   3. List tables within a base
 *   4. Fetch a sample of rows (used for pre-flight)
 *   5. List ALL rows via paginated calls (used for record creation)
 *   6. importTable: row fetch + batched record creation
 */
@Injectable()
export class NocoDbImportService {
  private readonly logger = new Logger(NocoDbImportService.name);

  constructor(private readonly records: RecordOpenApiV2Service) {}

  probe(baseUrl: string, token: string): Promise<NocoDbConnectionProbe> {
    const client = new NocoDbApiClient(baseUrl, token);
    return client.probe().then((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listBases(baseUrl: string, token: string): Promise<NocoDbBase[]> {
    return new NocoDbApiClient(baseUrl, token).listBases();
  }

  async listTables(
    baseUrl: string,
    token: string,
    baseId: string
  ): Promise<NocoDbTable[]> {
    return new NocoDbApiClient(baseUrl, token).listTables(baseId);
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
    tableId: string,
    pageSize = 100
  ): Promise<{ tableId: string; rowCount: number; sample: NocoDbRow[] }> {
    const rows = await new NocoDbApiClient(baseUrl, token).listRows(tableId, pageSize);
    return {
      tableId,
      rowCount: rows.length,
      sample: rows.slice(0, 5),
    };
  }

  /**
   * Full paginated row fetch used by the record-creation path.
   *
   * Honors `isCanceled()` between pages; throws
   * `INocoDbImportCanceledError` (code `NOCODB_CANCELED`) when the
   * predicate fires so the processor can reconcile the final state
   * without counting the partial run as a failure.
   *
   * @param onPage optional hook called after every page with the
   *               cumulative row count — useful for streaming
   *               progress without buffering the full result.
   */
  async listAllRows(
    baseUrl: string,
    token: string,
    tableId: string,
    pageSize = 100,
    isCanceled: () => boolean = () => false,
    onPage?: (counts: { fetched: number }) => void
  ): Promise<NocoDbRow[]> {
    const client = new NocoDbApiClient(baseUrl, token);
    const collected: NocoDbRow[] = [];
    let offset = 0;
    // NocoDB v2 exposes `limit` + `offset` for pagination; we cap the
    // number of pages at 500 to keep the durable task bounded (50k
    // rows at pageSize=100). A follow-up round will switch to the v2
    // cursor pagination once NocoDB exposes a stable cursor.
    const MAX_PAGES = 500;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      if (isCanceled()) {
        throw new INocoDbImportCanceledError();
      }
      const rows = await client.listRows(tableId, pageSize, offset);
      if (rows.length === 0) break;
      collected.push(...rows);
      offset += rows.length;
      onPage?.({ fetched: collected.length });
      if (rows.length < pageSize) break;
    }
    if (isCanceled()) {
      throw new INocoDbImportCanceledError();
    }
    return collected;
  }

  /**
   * Round-36 record-creation path. Fetches every page of rows,
   * converts each row to a Teable field dict, and writes them in
   * `batchSize` chunks via `recordOpenApiV2Service.createRecords`.
   *
   * `mapRowToFields` is injected so the unit spec can drive the
   * mapper without coupling to the driver's mapping function.
   */
  async importTable(input: {
    baseUrl: string;
    apiToken: string;
    tableName: string;
    tableId: string;
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
      input.tableName,
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
        throw new INocoDbImportCanceledError();
      }
      const chunk = rows.slice(i, i + batchSize);
      const records = chunk.map((row) => ({
        fields: input.mapRowToFields(row as Record<string, unknown>),
      }));
      if (records.length === 0) continue;
      try {
        await this.records.createRecords(input.tableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: true,
          records,
        });
        processedCount += records.length;
      } catch (error) {
        // Per-batch failure: record it but don't abort the whole
        // import unless the error is non-retryable. Teable's
        // createRecords already typecasts; if a record fails it
        // usually means the destination table is missing every
        // matching field name. Surface a clear message and continue
        // — operators can resume by re-running with the missing
        // fields added.
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `nocodb import batch failed at offset=${i} tableId=${input.tableId}: ${message}`
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
      throw new INocoDbImportCanceledError();
    }

    return {
      processedCount,
      failedCount,
      totalCount: totalSeen,
    };
  }
}

/**
 * Round-36: thrown by `listAllRows` / `importTable` when the cancel
 * predicate fires mid-pagination. Matches the
 * `IAirtableImportCanceledError` pattern; the processor maps the
 * `code` to a no-op success (via `KNOWN_CANCEL_CODES`).
 */
export class INocoDbImportCanceledError extends Error {
  readonly code = 'NOCODB_CANCELED';
  constructor() {
    super('nocodb import was canceled');
    this.name = 'INocoDbImportCanceledError';
  }
}
