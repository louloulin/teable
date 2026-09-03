/**
 * Airtable adapter for the unified source-import driver.
 *
 * Wraps the legacy `AirtableImportService.importBase` so Airtable
 * migrations travel through the same durable-task pipeline as Notion:
 *   - 5-minute lease + 30-second heartbeat
 *   - idempotency, retry, cancel-before-claim semantics
 *   - cancel checked between table-progress events
 *   - progress reported in the durable-task row as records stream in
 *
 * The adapter is intentionally thin: the heavy lifting (records →
 * cells, attachments, link creation, view-config import) lives in the
 * existing `AirtableImportService`. Credentials are read from the task
 * row's `payload` JSON — the controller stores either a personal
 * access token (PAT) or an integration id, mirroring the synchronous
 * controller path.
 */
import { Injectable, Logger } from '@nestjs/common';
import {
  type ISourceImportDriver,
  type ISourceImportRunInput,
  type ISourceImportRunResult,
} from './source-import.driver';
import {
  AirtableImportService,
  type IAirtableImportProgress,
  type IAirtableImportProgressReporter,
} from '../airtable-import/airtable-import.service';
import type { IImportAirtableRo, IImportAirtableVo } from '@teable/openapi';

export interface IAirtableTaskPayload {
  /** Personal access token. Mutually exclusive with `integrationId`. */
  accessToken?: string;
  /** Server-resolved integration id (resolved via `IAirtableImportTokenResolver`). */
  integrationId?: string;
  importAttachments?: boolean;
  importViewConfig?: boolean;
  shareLink?: string;
  baseName?: string;
}

const PROGRESS_EVENTS_TO_IGNORE = new Set<string>([
  'fetching_schema',
  'creating_base',
  'resolving_dependencies',
  'tables_planned',
]);

/**
 * Error class thrown by the driver when the durable-task row is canceled
 * mid-flight. The processor catches `code === 'AIRTABLE_IMPORT_CANCELED'`
 * and reconciles the final state through `markSucceeded` instead of
 * counting it as a failure.
 */
export class IAirtableImportCanceledError extends Error {
  readonly code = 'AIRTABLE_IMPORT_CANCELED';
  constructor() {
    super('airtable import was canceled');
    this.name = 'IAirtableImportCanceledError';
  }
}

@Injectable()
export class AirtableSourceDriver implements ISourceImportDriver {
  readonly source = 'airtable' as const;
  private readonly logger = new Logger(AirtableSourceDriver.name);

  constructor(private readonly imports: AirtableImportService) {}

  async runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult> {
    const task = input.task;
    if (!task.spaceId) throw new Error('airtable import requires spaceId');
    if (!task.remoteId) throw new Error('airtable import requires airtableBaseId (remoteId)');
    const payload = (task as unknown as { payload?: IAirtableTaskPayload | null }).payload ?? {};

    if (!payload.accessToken && !payload.integrationId) {
      throw new Error('airtable import payload must carry accessToken or integrationId');
    }

    const ro: IImportAirtableRo = {
      spaceId: task.spaceId,
      airtableBaseId: task.remoteId,
      ...(task.tableId ? {} : {}), // baseId lives on the durable row, not the task
      ...(task as unknown as { baseId?: string | null }).baseId
        ? { baseId: (task as unknown as { baseId: string }).baseId }
        : {},
      ...(payload.accessToken ? { accessToken: payload.accessToken } : {}),
      ...(payload.integrationId ? { integrationId: payload.integrationId } : {}),
      ...(payload.importAttachments ? { importAttachments: true } : { importAttachments: false }),
      ...(payload.importViewConfig ? { importViewConfig: true } : { importViewConfig: false }),
      ...(payload.shareLink ? { shareLink: payload.shareLink } : {}),
      ...(payload.baseName ? { baseName: payload.baseName } : {}),
    } as IImportAirtableRo;

    let lastSnapshot = { processedCount: 0, failedCount: 0, totalCount: 0 };
    let canceled = false;

    const wrappedReporter: IAirtableImportProgressReporter = (event: IAirtableImportProgress) => {
      if (canceled) return;
      if (typeof event.processedRows === 'number') {
        lastSnapshot = {
          processedCount: event.processedRows,
          failedCount: 0,
          totalCount: event.processedRows,
        };
        {
          const result = input.onProgress?.(lastSnapshot);
          if (result) {
            Promise.resolve(result).catch(() => undefined);
          }
        }
      }
      // Honor cancel between table-progress events (synchronous via the
      // processor's in-memory cancel set; the predicate never awaits).
      if (event.phase && !PROGRESS_EVENTS_TO_IGNORE.has(event.phase)) {
        if (input.isCanceled()) {
          canceled = true;
          throw new IAirtableImportCanceledError();
        }
      }
    };

    const result: IImportAirtableVo = await this.imports.importBase(ro, wrappedReporter);
    this.logger.log(
      `airtable import ${task.id} done: imported=${lastSnapshot.processedCount}`
    );
    return {
      processedCount: lastSnapshot.processedCount,
      failedCount: lastSnapshot.failedCount,
      totalCount: lastSnapshot.totalCount,
      result,
    };
  }
}
