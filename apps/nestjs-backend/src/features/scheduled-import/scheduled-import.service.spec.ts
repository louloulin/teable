/**
 * Scheduled import/export — pure helpers spec (Stage 88).
 */

import {
  appendJob,
  checkpoint,
  chooseChunkSize,
  chunkCount,
  isExpired,
  isFinished,
  planChunks,
  validateJob,
} from './scheduled-import.service';
import {
  DEFAULT_CHUNK_ROWS,
  MAX_TOTAL_ROWS,
  MIN_CHUNK_ROWS,
} from './scheduled-import.types';
import type { IImportJob } from './scheduled-import.types';

const baseJob = (over: Partial<IImportJob> = {}): IImportJob => ({
  id: 'job-1',
  orgId: 'o1',
  direction: 'import',
  format: 'csv',
  sourceUri: 's3://bucket/key',
  chunkSize: 5000,
  maxRows: 1_000_000,
  deadline: '2026-12-31T00:00:00Z',
  ...over,
});

describe('scheduled-import.validateJob', () => {
  it('passes', () => {
    expect(validateJob(baseJob())).toBeNull();
  });
  it('rejects missing sourceUri on import', () => {
    expect(validateJob(baseJob({ sourceUri: undefined }))).toContain('sourceUri');
  });
  it('rejects missing targetUri on export', () => {
    expect(validateJob(baseJob({ direction: 'export', sourceUri: undefined, targetUri: undefined }))).toContain(
      'targetUri'
    );
  });
  it('rejects bad chunk size', () => {
    expect(validateJob(baseJob({ chunkSize: 10 }))).toContain('chunkSize');
  });
  it('rejects maxRows cap', () => {
    expect(validateJob(baseJob({ maxRows: MAX_TOTAL_ROWS + 1 }))).toContain('maxRows');
  });
});

describe('scheduled-import.planChunks', () => {
  it('plans even split', () => {
    const out = planChunks({ job: baseJob(), totalRows: 12_500 });
    expect(out).toEqual([
      { start: 0, end: 5_000 },
      { start: 5_000, end: 10_000 },
      { start: 10_000, end: 12_500 },
    ]);
  });
  it('respects checkpoint', () => {
    const out = planChunks({ job: baseJob({ checkpoint: 10_000 }), totalRows: 12_500 });
    expect(out).toEqual([{ start: 10_000, end: 12_500 }]);
  });
  it('clamps by maxRows', () => {
    const out = planChunks({ job: baseJob({ maxRows: 7_500 }), totalRows: 12_500 });
    expect(out).toEqual([
      { start: 0, end: 5_000 },
      { start: 5_000, end: 7_500 },
    ]);
  });
});

describe('scheduled-import.chunkCount', () => {
  it('counts', () => {
    expect(chunkCount({ job: baseJob(), totalRows: 12_500 })).toBe(3);
  });
});

describe('scheduled-import.appendJob', () => {
  it('appends', () => {
    const out = appendJob({ jobs: [], job: baseJob() });
    expect(out.length).toBe(1);
  });
});

describe('scheduled-import.chooseChunkSize', () => {
  it('default when invalid', () => {
    expect(chooseChunkSize(undefined)).toBe(DEFAULT_CHUNK_ROWS);
    expect(chooseChunkSize(10)).toBe(DEFAULT_CHUNK_ROWS);
  });
  it('valid', () => {
    expect(chooseChunkSize(MIN_CHUNK_ROWS + 100)).toBe(MIN_CHUNK_ROWS + 100);
  });
});

describe('scheduled-import.isExpired', () => {
  it('past', () => {
    expect(isExpired(baseJob(), Date.parse('2027-01-01T00:00:00Z'))).toBe(true);
  });
  it('not yet', () => {
    expect(isExpired(baseJob(), Date.parse('2025-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('scheduled-import.isFinished', () => {
  it('done', () => {
    expect(isFinished({ job: baseJob({ checkpoint: 1_000_000 }), totalRows: 5_000_000 })).toBe(true);
  });
  it('not done', () => {
    expect(isFinished({ job: baseJob(), totalRows: 5_000_000 })).toBe(false);
  });
});

describe('scheduled-import.checkpoint', () => {
  it('stamps progress', () => {
    const cp = checkpoint({
      job: baseJob(),
      rowsProcessed: 5_000,
      rowsFailed: 2,
      chunks: 1,
      now: Date.parse('2026-06-01T00:00:00Z'),
    });
    expect(cp.rowsProcessed).toBe(5_000);
    expect(cp.rowsFailed).toBe(2);
    expect(cp.chunks).toBe(1);
    expect(cp.finishedAt).toBeUndefined();
  });
  it('stamps finishedAt past deadline', () => {
    const cp = checkpoint({
      job: baseJob(),
      rowsProcessed: 5_000,
      rowsFailed: 0,
      chunks: 1,
      now: Date.parse('2027-06-01T00:00:00Z'),
    });
    expect(cp.finishedAt).toBe('2026-12-31T00:00:00Z');
  });
});
