import { Injectable, Logger } from '@nestjs/common';
import { FieldKeyType } from '@teable/core';
import { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';
import { SmartSuiteApiClient } from './smartsuite-api.client';
import type {
  SmartSuiteApp,
  SmartSuiteConnectionProbe,
  SmartSuiteRecord,
  SmartSuiteTable,
} from './smartsuite-import.types';

/**
 * Round-22: SmartSuite migration driver (minimal). Mirrors baserow (R16) +
 * clickup (R17) + jira (R18) + monday (R19) + nocodb (R20) + smartsheet (R21)
 * pattern.
 *
 * Round-41: adds `listAllRecords` (offset-based pagination + cancel
 * guards) + `importTable` (record-creation path via
 * `recordOpenApiV2Service.createRecords` in 100-row batches with cancel
 * + progress hooks). Mirrors the NocoDB / Baserow / Jira / monday /
 * ClickUp driver shape so the source-driver pattern stays uniform.
 */
@Injectable()
export class SmartSuiteImportService {
  private readonly logger = new Logger(SmartSuiteImportService.name);

  constructor(private readonly records: RecordOpenApiV2Service) {}

  probe(token: string): Promise<SmartSuiteConnectionProbe> {
    const client = new SmartSuiteApiClient(token);
    return client.probe().then((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listApps(token: string): Promise<{ count: number; apps: SmartSuiteApp[] }> {
    const apps = await new SmartSuiteApiClient(token).listApps();
    return { count: apps.length, apps: apps.slice(0, 50) };
  }

  async listTables(token: string, appId: string): Promise<SmartSuiteTable[]> {
    return new SmartSuiteApiClient(token).listTables(appId);
  }

  /**
   * Lightweight pre-flight: returns recordCount + 5-record sample so
   * the source driver can confirm connectivity + data shape before
   * committing to a full migration. The full record-creation path
   * uses `listAllRecords` instead.
   */
  async fetchRecords(
    token: string,
    appId: string,
    limit = 100
  ): Promise<{ appId: string; recordCount: number; sample: SmartSuiteRecord[] }> {
    const { items } = await new SmartSuiteApiClient(token).fetchRecords(appId, limit);
    return {
      appId,
      recordCount: items.length,
      sample: items.slice(0, 5),
    };
  }

  /**
   * Round-41: full paginated record fetch used by the record-creation
   * path. Honors `isCanceled()` between pages; throws
   * `ISmartSuiteImportCanceledError` (code `SMARTSUITE_CANCELED`) when
   * the predicate fires so the processor can reconcile the final
   * state without counting the partial run as a failure.
   *
   * SmartSuite returns `offset` in the response — null means "no more
   * pages"; a number is the next page's offset. Capped at 500 pages.
   */
  async listAllRecords(
    token: string,
    appId: string,
    pageSize = 100,
    isCanceled: () => boolean = () => false,
    onPage?: (counts: { fetched: number }) => void
  ): Promise<SmartSuiteRecord[]> {
    const client = new SmartSuiteApiClient(token);
    const collected: SmartSuiteRecord[] = [];
    let offset = 0;
    const MAX_PAGES = 500;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      if (isCanceled()) {
        throw new ISmartSuiteImportCanceledError();
      }
      const { items, nextOffset } = await client.fetchRecords(appId, pageSize, offset);
      if (items.length === 0) break;
      collected.push(...items);
      onPage?.({ fetched: collected.length });
      if (nextOffset === null || nextOffset === undefined) break;
      if (nextOffset === offset) break; // safety: avoid infinite loop
      offset = nextOffset;
    }
    if (isCanceled()) {
      throw new ISmartSuiteImportCanceledError();
    }
    return collected;
  }

  /**
   * Round-41 record-creation path. Fetches every page of records,
   * converts each record to a Teable field dict, and writes them in
   * `batchSize` chunks via `recordOpenApiV2Service.createRecords`.
   *
   * `mapRecordToFields` is injected so the unit spec can drive the
   * mapper without coupling to the driver's mapping function.
   */
  async importTable(input: {
    apiToken: string;
    appId: string;
    destinationTableId: string;
    pageSize?: number;
    batchSize?: number;
    isCanceled: () => boolean;
    onProgress?: (counts: {
      processedCount: number;
      failedCount: number;
      totalCount: number;
    }) => void | Promise<void>;
    mapRecordToFields: (record: Record<string, unknown>) => Record<string, unknown>;
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
    const records = await this.listAllRecords(
      input.apiToken,
      input.appId,
      pageSize,
      input.isCanceled,
      ({ fetched }) => {
        totalSeen = fetched;
      }
    );

    let processedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      if (input.isCanceled()) {
        throw new ISmartSuiteImportCanceledError();
      }
      const chunk = records.slice(i, i + batchSize);
      const cells = chunk.map((record) => ({
        fields: input.mapRecordToFields(record as unknown as Record<string, unknown>),
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
          `smartsuite import batch failed at offset=${i} destTableId=${input.destinationTableId}: ${message}`
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
      throw new ISmartSuiteImportCanceledError();
    }

    return {
      processedCount,
      failedCount,
      totalCount: totalSeen,
    };
  }
}

/**
 * Round-41: thrown by `listAllRecords` / `importTable` when the cancel
 * predicate fires mid-pagination. Matches the
 * `IAirtableImportCanceledError` / `INocoDbImportCanceledError` /
 * `IBaserowImportCanceledError` / `IJiraImportCanceledError` /
 * `IMondayImportCanceledError` / `IClickUpImportCanceledError`
 * pattern; the processor maps the `code` to a no-op success (via
 * `KNOWN_CANCEL_CODES`).
 */
export class ISmartSuiteImportCanceledError extends Error {
  readonly code = 'SMARTSUITE_CANCELED';
  constructor() {
    super('smartsuite import was canceled');
    this.name = 'ISmartSuiteImportCanceledError';
  }
}
