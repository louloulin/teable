/**
 * Driver contract for unified source imports (Cloud §migrations).
 *
 * Each connector (Notion, Google Sheets, Airtable, ...) implements
 * this interface. The unified `SourceImportService` drives the
 * durable-task protocol; drivers only know how to enumerate records
 * and produce Teable-shaped cells.
 */
import type { Prisma } from '@teable/db-main-prisma';

/**
 * Multi-provider token used by `SourceImportModule` to register every
 * `ISourceImportDriver` instance. The `SourceImportProcessor` injects
 * all of them at once and indexes them by `driver.source`.
 */
export const SOURCE_IMPORT_DRIVER = 'SOURCE_IMPORT_DRIVER';

export type SourceImportSource = 'notion' | 'google_sheets' | 'airtable' | string;

export interface ISourceImportBatch {
  nextCursor?: string;
  records: Array<{ fields: Record<string, unknown> }>;
  progress?: Record<string, unknown>;
}

export interface ISourceImportDriverContext {
  accessToken: string;
  cursor?: string;
  incremental?: boolean;
}

export interface ISourceImportRunResult {
  processedCount: number;
  failedCount: number;
  totalCount: number;
  result?: unknown;
}

export interface ISourceImportTaskSlice {
  id: string;
  spaceId: string | null;
  baseId?: string | null;
  tableId: string | null;
  remoteId: string | null;
  incremental?: boolean;
  /** Free-form credential + metadata blob (sources read what they need). */
  payload?: Record<string, unknown> | null;
}

export interface ISourceImportRunInput {
  task: ISourceImportTaskSlice;
  /** Synchronous predicate called between batches. When true, the driver
   *  must abort and return whatever has been written so far
   *  (`SourceImportService` will then reconcile the final state against
   *  `cancelRequested`). The processor supplies an in-memory-backed
   *  predicate so drivers never have to await DB reads; the service's
   *  DB-backed `isCanceled` is only consulted on cold start. */
  isCanceled: () => boolean;
  /** Streaming progress hook. Called after each successful createRecords
   *  batch with the cumulative counts so the task row stays observable. */
  onProgress?: (counts: { processedCount: number; failedCount: number; totalCount: number }) => void | Promise<void>;
}

export interface ISourceImportDriver {
  readonly source: SourceImportSource;
  /** Executes the full migration loop for a single task. Implementations
   *  are responsible for token resolution, cursor paging, batched writes,
   *  and honoring `isCanceled`. */
  runImport(input: ISourceImportRunInput): Promise<ISourceImportRunResult>;
  /** Optional helper used by the controller's source picker. */
  listDatabases?(input: { spaceId: string; accessToken: string }): Promise<unknown[]>;
  /** Low-level batched fetch. Kept for diagnostics and future streaming
   *  drivers; the unified processor never calls it directly. */
  fetchBatch?(input: {
    spaceId: string;
    tableId: string;
    remoteId: string;
    context: ISourceImportDriverContext;
  }): Promise<ISourceImportBatch>;
  /** Low-level batched writer. Same status as `fetchBatch`. */
  writeBatch?(input: {
    tableId: string;
    records: ISourceImportBatch['records'];
    tx?: Prisma.TransactionClient;
  }): Promise<{ written: number }>;
}
