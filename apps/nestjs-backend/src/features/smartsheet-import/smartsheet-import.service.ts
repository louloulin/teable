import { Injectable, Logger } from '@nestjs/common';
import { FieldKeyType } from '@teable/core';
import { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';
import { SmartsheetApiClient } from './smartsheet-api.client';
import type {
  SmartsheetConnectionProbe,
  SmartsheetRow,
  SmartsheetSheet,
} from './smartsheet-import.types';

/**
 * Round-21: Smartsheet migration driver (minimal). Mirrors baserow (R16) +
 * clickup (R17) + jira (R18) + monday (R19) + nocodb (R20) pattern.
 *
 * Round-42: adds `listAllRows` (page-number pagination + cancel guards)
 *   + `importTable` (record-creation path via
 *   `recordOpenApiV2Service.createRecords` in batched chunks with cancel
 *   + progress hooks). Mirrors the NocoDB / Baserow / Jira / monday /
 *   ClickUp / SmartSuite driver shape so the source-driver pattern
 *   stays uniform.
 *
 * Smartsheet-specific columns (system, picklist, contact-list, etc.) are
 * kept as opaque blobs in this round; downstream translator handles them.
 */
@Injectable()
export class SmartsheetImportService {
  private readonly logger = new Logger(SmartsheetImportService.name);

  constructor(private readonly records: RecordOpenApiV2Service) {}

  probe(token: string): Promise<SmartsheetConnectionProbe> {
    const client = new SmartsheetApiClient(token);
    return client.probe().then((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listSheets(token: string, pageSize = 100): Promise<SmartsheetSheet[]> {
    return new SmartsheetApiClient(token).listSheets(pageSize);
  }

  /**
   * Single-page row fetch used by the lightweight `/rows` preview
   * endpoint. Returns the raw page from the API client (rows +
   * nextPage cursor); the controller slices a 5-row sample for the UI.
   */
  async fetchRowsPage(
    token: string,
    sheetId: number,
    pageSize = 100
  ): Promise<{ rows: SmartsheetRow[]; nextPage: number | null }> {
    return new SmartsheetApiClient(token).listRows(sheetId, pageSize, 1);
  }

  /**
   * Round-42: full paginated row fetch used by the record-creation
   * path. Honors `isCanceled()` between pages; throws
   * `ISmartsheetImportCanceledError` (code `SMARTSHEET_CANCELED`) when
   * the predicate fires so the processor can reconcile the final
   * state without counting the partial run as a failure.
   *
   * Smartsheet uses page-number pagination: `page=1,2,3,...` until
   * the response carries `page: null` or fewer than `pageSize` rows.
   * Capped at 500 pages to prevent runaway loops.
   */
  async listAllRows(
    token: string,
    sheetId: number,
    pageSize = 500,
    isCanceled: () => boolean = () => false,
    onPage?: (counts: { fetched: number }) => void
  ): Promise<SmartsheetRow[]> {
    const client = new SmartsheetApiClient(token);
    const collected: SmartsheetRow[] = [];
    let page = 1;
    const MAX_PAGES = 500;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      if (isCanceled()) {
        throw new ISmartsheetImportCanceledError();
      }
      const { rows, nextPage } = await client.listRows(sheetId, pageSize, page);
      if (rows.length === 0) break;
      collected.push(...rows);
      onPage?.({ fetched: collected.length });
      if (nextPage === null || nextPage === undefined) break;
      if (nextPage === page) break; // safety: avoid infinite loop
      page = nextPage;
    }
    if (isCanceled()) {
      throw new ISmartsheetImportCanceledError();
    }
    return collected;
  }

  /**
   * Round-42 record-creation path. Fetches every page of rows,
   * converts each row to a Teable field dict, and writes them in
   * `batchSize` chunks via `recordOpenApiV2Service.createRecords`.
   *
   * `mapRowToFields` is injected so the unit spec can drive the
   * mapper without coupling to the driver's mapping function.
   */
  async importTable(input: {
    apiToken: string;
    sheetId: number | string;
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
    const pageSize = input.pageSize ?? 500;
    const batchSize = Math.min(
      Math.max(1, input.batchSize ?? 100),
      1000
    );
    const numericSheetId =
      typeof input.sheetId === 'string' ? Number(input.sheetId) : input.sheetId;
    if (!Number.isFinite(numericSheetId)) {
      throw new Error(
        `smartsheet importTable: sheetId must be numeric, got ${String(input.sheetId)}`
      );
    }

    let totalSeen = 0;
    const rows = await this.listAllRows(
      input.apiToken,
      numericSheetId,
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
        throw new ISmartsheetImportCanceledError();
      }
      const chunk = rows.slice(i, i + batchSize);
      const cells = chunk.map((row) => ({
        fields: input.mapRowToFields(row as unknown as Record<string, unknown>),
      }));
      if (cells.length === 0) continue;
      try {
        await this.records.createRecords(input.destinationTableId, {
          fieldKeyType: FieldKeyType.Name,
          typecast: true,
          records: cells,
        });
        processedCount += cells.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `smartsheet import batch failed at offset=${i} destTableId=${input.destinationTableId}: ${message}`
        );
        failedCount += cells.length;
      }
      await input.onProgress?.({
        processedCount,
        failedCount,
        totalCount: totalSeen,
      });
    }

    if (input.isCanceled()) {
      throw new ISmartsheetImportCanceledError();
    }

    return {
      processedCount,
      failedCount,
      totalCount: totalSeen,
    };
  }
}

/**
 * Round-42: thrown by `listAllRows` / `importTable` when the cancel
 * predicate fires mid-pagination. Matches the
 * `IAirtableImportCanceledError` / `INocoDbImportCanceledError` /
 * `IBaserowImportCanceledError` / `IJiraImportCanceledError` /
 * `IMondayImportCanceledError` / `IClickUpImportCanceledError` /
 * `ISmartSuiteImportCanceledError` pattern; the processor maps the
 * `code` to a no-op success (via `KNOWN_CANCEL_CODES`).
 */
export class ISmartsheetImportCanceledError extends Error {
  readonly code = 'SMARTSHEET_CANCELED';
  constructor() {
    super('smartsheet import was canceled');
    this.name = 'ISmartsheetImportCanceledError';
  }
}
