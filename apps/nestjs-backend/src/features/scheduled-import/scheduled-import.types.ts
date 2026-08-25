/**
 * Scheduled import/export — types (Stage 88).
 */

export type ImportFormat = 'csv' | 'json' | 'xlsx';
export type ImportDirection = 'import' | 'export';

export interface IImportJob {
  id: string;
  orgId: string;
  direction: ImportDirection;
  format: ImportFormat;
  /** Source — CSV/JSON URI, or XLSX object key. */
  sourceUri?: string;
  /** Output target — baseId.tableId or file URI. */
  targetUri?: string;
  /** Rows per chunk — controls memory pressure. */
  chunkSize: number;
  /** Max rows to process (cap). */
  maxRows: number;
  /** ISO timestamp deadline. */
  deadline: string;
  /** UTC timestamp of last checkpoint (resume offset). */
  checkpoint?: number;
}

export interface IImportCheckpoint {
  jobId: string;
  rowsProcessed: number;
  rowsFailed: number;
  finishedAt?: string;
  /** Per-chunk telemetry. */
  chunks: number;
}

export const MAX_CHUNK_ROWS = 50_000;
export const MIN_CHUNK_ROWS = 100;
export const DEFAULT_CHUNK_ROWS = 5_000;
export const MAX_JOBS_PER_ORG = 128;
export const MAX_TOTAL_ROWS = 10_000_000;
