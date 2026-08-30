/**
 * Scheduled import/export — pure helpers (Stage 88).
 */

import type {
  IImportCheckpoint,
  IImportJob,
} from './scheduled-import.types';
import {
  DEFAULT_CHUNK_ROWS,
  MAX_CHUNK_ROWS,
  MAX_JOBS_PER_ORG,
  MAX_TOTAL_ROWS,
  MIN_CHUNK_ROWS,
} from './scheduled-import.types';

/** Validate a job. */
export function validateJob(j: IImportJob): string | null {
  if (!j.id) return 'id required';
  if (!j.orgId) return 'orgId required';
  if (j.direction !== 'import' && j.direction !== 'export') return `bad direction: ${j.direction}`;
  if (j.format !== 'csv' && j.format !== 'json' && j.format !== 'xlsx') return `bad format: ${j.format}`;
  if (j.direction === 'import' && !j.sourceUri) return 'sourceUri required for import';
  if (j.direction === 'export' && !j.targetUri) return 'targetUri required for export';
  if (!Number.isInteger(j.chunkSize) || j.chunkSize < MIN_CHUNK_ROWS || j.chunkSize > MAX_CHUNK_ROWS) {
    return `chunkSize out of range ${MIN_CHUNK_ROWS}..${MAX_CHUNK_ROWS}`;
  }
  if (j.maxRows > MAX_TOTAL_ROWS) return `maxRows cap ${MAX_TOTAL_ROWS}`;
  if (!j.deadline) return 'deadline required';
  return null;
}

/** Build a checkpoint from progress. */
export function checkpoint(input: {
  job: IImportJob;
  rowsProcessed: number;
  rowsFailed: number;
  chunks: number;
  now: number;
}): IImportCheckpoint {
  return {
    jobId: input.job.id,
    rowsProcessed: input.rowsProcessed,
    rowsFailed: input.rowsFailed,
    chunks: input.chunks,
    finishedAt: input.now > Date.parse(input.job.deadline) ? input.job.deadline : undefined,
  };
}

/** Plan the chunks for a job given a starting offset. */
export function planChunks(input: {
  job: IImportJob;
  totalRows: number;
}): Array<{ start: number; end: number }> {
  const start = input.job.checkpoint ?? 0;
  const remaining = Math.min(input.totalRows, input.job.maxRows) - start;
  if (remaining <= 0) return [];
  const out: Array<{ start: number; end: number }> = [];
  for (let off = start; off < start + remaining; off += input.job.chunkSize) {
    out.push({ start: off, end: Math.min(off + input.job.chunkSize, start + remaining) });
  }
  return out;
}

/** Number of chunks a job with the given rows would produce. */
export function chunkCount(input: { job: IImportJob; totalRows: number }): number {
  return planChunks(input).length;
}

/** Append a new job, capping per org. */
export function appendJob(input: { jobs: ReadonlyArray<IImportJob>; job: IImportJob }): IImportJob[] {
  return [...input.jobs, input.job].slice(-MAX_JOBS_PER_ORG);
}

/** Decide the chunk size for a job — uses default if not set. */
export function chooseChunkSize(requested: number | undefined): number {
  if (requested === undefined || !Number.isInteger(requested)) return DEFAULT_CHUNK_ROWS;
  if (requested < MIN_CHUNK_ROWS || requested > MAX_CHUNK_ROWS) return DEFAULT_CHUNK_ROWS;
  return requested;
}

/** Whether the job has exceeded its deadline. */
export function isExpired(j: IImportJob, now: number): boolean {
  return now > Date.parse(j.deadline);
}

/** Whether the job is fully done. */
export function isFinished(input: { job: IImportJob; totalRows: number }): boolean {
  const processed = input.job.checkpoint ?? 0;
  const target = Math.min(input.totalRows, input.job.maxRows);
  return processed >= target;
}
