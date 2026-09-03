import { Injectable, Logger } from '@nestjs/common';
import { FieldKeyType } from '@teable/core';
import { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';
import { ClickUpApiClient } from './clickup-api.client';
import type {
  ClickUpConnectionProbe,
  ClickUpList,
  ClickUpSpace,
  ClickUpTask,
} from './clickup-import.types';

/**
 * Round-17: ClickUp migration driver (minimal). Mirrors the baserow-import
 * pattern from Round-16. Provides:
 *   1. Token probe — verify personal access token against /team endpoint
 *   2. List spaces within a workspace
 *   3. List lists within a space
 *   4. Fetch tasks (paginated) from a list
 *
 * Round-40: adds `listAllTasks` (page-based pagination + cancel guards)
 * + `importTable` (record-creation path via
 * `recordOpenApiV2Service.createRecords` in 100-row batches with cancel
 * + progress hooks). Mirrors the NocoDB / Baserow / Jira / monday driver
 * shape so the source-driver pattern stays uniform.
 */
@Injectable()
export class ClickUpImportService {
  private readonly logger = new Logger(ClickUpImportService.name);

  constructor(private readonly records: RecordOpenApiV2Service) {}

  probe(token: string): Promise<ClickUpConnectionProbe> {
    const client = new ClickUpApiClient(token);
    return client.probe().then((p) => ({
      ...p,
      fetchedAt: new Date().toISOString(),
    }));
  }

  async listSpaces(token: string, teamId: string): Promise<ClickUpSpace[]> {
    const client = new ClickUpApiClient(token);
    return client.listSpaces(teamId);
  }

  async listLists(token: string, spaceId: string): Promise<ClickUpList[]> {
    const client = new ClickUpApiClient(token);
    return client.listLists(spaceId);
  }

  /**
   * Lightweight pre-flight: returns taskCount + 5-task sample so the
   * source driver can confirm connectivity + data shape before
   * committing to a full migration. The full record-creation path
   * uses `listAllTasks` instead.
   */
  async fetchTasks(
    token: string,
    listId: string,
    pageSize = 100
  ): Promise<{ listId: string; taskCount: number; sample: ClickUpTask[] }> {
    const client = new ClickUpApiClient(token);
    const { tasks } = await client.listTasks(listId, pageSize);
    return {
      listId,
      taskCount: tasks.length,
      sample: tasks.slice(0, 5),
    };
  }

  /**
   * Round-40: full paginated task fetch used by the record-creation
   * path. Honors `isCanceled()` between pages; throws
   * `IClickUpImportCanceledError` (code `CLICKUP_CANCELED`) when the
   * predicate fires so the processor can reconcile the final state
   * without counting the partial run as a failure.
   *
   * ClickUp uses page-based pagination with `last_page` flag — keep
   * walking pages until `last_page` is true or the page is short.
   * Capped at 500 pages.
   */
  async listAllTasks(
    token: string,
    listId: string,
    pageSize = 100,
    includeClosed = false,
    isCanceled: () => boolean = () => false,
    onPage?: (counts: { fetched: number }) => void
  ): Promise<ClickUpTask[]> {
    const client = new ClickUpApiClient(token);
    const collected: ClickUpTask[] = [];
    let page = 0;
    const MAX_PAGES = 500;
    for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
      if (isCanceled()) {
        throw new IClickUpImportCanceledError();
      }
      const { tasks, lastPage } = await client.listTasks(
        listId,
        pageSize,
        page,
        includeClosed
      );
      if (tasks.length === 0) break;
      collected.push(...tasks);
      onPage?.({ fetched: collected.length });
      if (lastPage) break;
      page += 1;
    }
    if (isCanceled()) {
      throw new IClickUpImportCanceledError();
    }
    return collected;
  }

  /**
   * Round-40 record-creation path. Fetches every page of tasks,
   * converts each task to a Teable field dict, and writes them in
   * `batchSize` chunks via `recordOpenApiV2Service.createRecords`.
   *
   * `mapTaskToFields` is injected so the unit spec can drive the
   * mapper without coupling to the driver's mapping function.
   */
  async importTable(input: {
    apiToken: string;
    listId: string;
    destinationTableId: string;
    pageSize?: number;
    batchSize?: number;
    includeClosed?: boolean;
    isCanceled: () => boolean;
    onProgress?: (counts: {
      processedCount: number;
      failedCount: number;
      totalCount: number;
    }) => void | Promise<void>;
    mapTaskToFields: (task: Record<string, unknown>) => Record<string, unknown>;
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
    const tasks = await this.listAllTasks(
      input.apiToken,
      input.listId,
      pageSize,
      input.includeClosed ?? false,
      input.isCanceled,
      ({ fetched }) => {
        totalSeen = fetched;
      }
    );

    let processedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < tasks.length; i += batchSize) {
      if (input.isCanceled()) {
        throw new IClickUpImportCanceledError();
      }
      const chunk = tasks.slice(i, i + batchSize);
      const records = chunk.map((task) => ({
        fields: input.mapTaskToFields(task as unknown as Record<string, unknown>),
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
          `clickup import batch failed at offset=${i} destTableId=${input.destinationTableId}: ${message}`
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
      throw new IClickUpImportCanceledError();
    }

    return {
      processedCount,
      failedCount,
      totalCount: totalSeen,
    };
  }
}

/**
 * Round-40: thrown by `listAllTasks` / `importTable` when the cancel
 * predicate fires mid-pagination. Matches the
 * `IAirtableImportCanceledError` / `INocoDbImportCanceledError` /
 * `IBaserowImportCanceledError` / `IJiraImportCanceledError` /
 * `IMondayImportCanceledError` pattern; the processor maps the `code`
 * to a no-op success (via `KNOWN_CANCEL_CODES`).
 */
export class IClickUpImportCanceledError extends Error {
  readonly code = 'CLICKUP_CANCELED';
  constructor() {
    super('clickup import was canceled');
    this.name = 'IClickUpImportCanceledError';
  }
}
