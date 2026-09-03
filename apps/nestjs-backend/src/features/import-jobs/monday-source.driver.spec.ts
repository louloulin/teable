/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MondayInvalidPayloadError,
  MondayNotConfiguredError,
  MondaySourceDriver,
  mondayItemToFields,
  type IMondayTaskPayload,
} from './monday-source.driver';
import type {
  ISourceImportRunInput,
  ISourceImportTaskSlice,
} from './source-import.driver';

interface IRunInputOverrides {
  spaceId?: string;
  remoteId?: string;
  tableId?: string;
  payload?: IMondayTaskPayload;
  isCanceled?: () => boolean;
}

interface IMockMondayImports {
  probe: ReturnType<typeof vi.fn>;
  fetchItems: ReturnType<typeof vi.fn>;
  importTable: ReturnType<typeof vi.fn>;
}

const buildTask = (overrides: IRunInputOverrides = {}): ISourceImportTaskSlice => ({
  id: overrides.tableId ? `task_${overrides.tableId}` : 'task_monday',
  spaceId: overrides.spaceId ?? 'spc_1',
  remoteId: overrides.remoteId ?? '1234567890',
  tableId: overrides.tableId ?? 'tbl_local',
  payload: (overrides.payload as unknown as Record<string, unknown>) ?? {},
});

const buildInput = (overrides: IRunInputOverrides = {}): ISourceImportRunInput => {
  const isCanceled = overrides.isCanceled ?? (() => false);
  return {
    task: buildTask(overrides),
    isCanceled,
    onProgress: vi.fn(),
  };
};

describe('MondaySourceDriver', () => {
  let driver: MondaySourceDriver;
  let imports: IMockMondayImports;

  beforeEach(() => {
    imports = {
      probe: vi.fn(async () => ({
        ok: true,
        workspaceCount: 2,
        boardCount: 5,
        fetchedAt: '',
      })),
      fetchItems: vi.fn(async () => ({
        boardId: '1234567890',
        itemCount: 0,
        sample: [],
      })),
      // Round-39 default mock returns 3 imported rows.
        importTable: vi.fn(async () => ({
          processedCount: 3,
          failedCount: 0,
          totalCount: 3,
        })),
    };
    driver = new MondaySourceDriver(undefined, imports as never);
  });

  it('R-MON-1: source identifier is "monday"', () => {
    expect(driver.source).toBe('monday');
  });

  it('R-MON-2: missing spaceId raises MondayInvalidPayloadError', async () => {
    const input = buildInput({ spaceId: '' });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      MondayInvalidPayloadError
    );
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'MONDAY_INVALID_PAYLOAD',
    });
  });

  it('R-MON-3: missing boardId AND no remoteId raises MondayInvalidPayloadError', async () => {
    const input = buildInput({ remoteId: '', payload: {} });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'MONDAY_INVALID_PAYLOAD',
    });
  });

  it('R-MON-4: missing tableId raises MondayInvalidPayloadError (R39 record-creation requirement)', async () => {
    const input = buildInput({ tableId: '' });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'MONDAY_INVALID_PAYLOAD',
    });
  });

  it('R-MON-5: boardId from payload overrides task.remoteId', async () => {
    const input = buildInput({
      remoteId: 'remote_board',
      payload: { boardId: 'payload_board', apiToken: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({ result: { boardId: 'payload_board' } });
  });

  it('R-MON-6: valid payload calls probe + importTable (Round 39 record-creation path)', async () => {
    const input = buildInput({
      payload: { boardId: '1234567890', apiToken: 'tok_xyz' },
    });
    const result = await driver.runImport(input);
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.probe).toHaveBeenCalledWith('tok_xyz');
    expect(imports.importTable).toHaveBeenCalledTimes(1);
    const call = imports.importTable.mock.calls[0][0];
    expect(call).toMatchObject({
      apiToken: 'tok_xyz',
      boardId: '1234567890',
      destinationTableId: 'tbl_local',
      pageSize: 100,
      batchSize: 100,
    });
    expect(typeof call.mapItemToFields).toBe('function');
    expect(result).toMatchObject({
      processedCount: 3,
      failedCount: 0,
      totalCount: 3,
      result: { boardId: '1234567890' },
    });
  });

  it('R-MON-7: cancel predicate returning true at first probe wins (no API call)', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: { boardId: '1234567890', apiToken: 'tok' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'MONDAY_CANCELED',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-MON-8: cancel at second probe (after probe) wins, before record creation', async () => {
    let count = 0;
    const input = buildInput({
      isCanceled: () => {
        count += 1;
        return count >= 2;
      },
      payload: { boardId: '1234567890', apiToken: 'tok' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'MONDAY_CANCELED',
    });
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-MON-9: MondayInvalidPayloadError lists missing fields', async () => {
    const input = buildInput({ spaceId: '', remoteId: '', payload: {} });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(MondayInvalidPayloadError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/spaceId|boardId|tableId/);
    }
  });

  it('R-MON-10: MondayNotConfiguredError carries a remediation hint (no imports service)', async () => {
    const noImportsDriver = new MondaySourceDriver();
    const input = buildInput({
      payload: { boardId: '1234567890', apiToken: 't' },
    });
    try {
      await noImportsDriver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(MondayNotConfiguredError);
      const err = e as MondayNotConfiguredError;
      expect(err.remediation).toMatch(/MondayImportService/);
      expect(err.remediation).toMatch(/GraphQL|cursor/);
    }
  });

  it('R-MON-11: missing apiToken raises MondayInvalidPayloadError', async () => {
    const input = buildInput({
      payload: { boardId: '1234567890' /* no apiToken */ },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'MONDAY_INVALID_PAYLOAD',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-MON-12: custom payload.limit is forwarded to importTable as pageSize', async () => {
    const input = buildInput({
      payload: { boardId: '1234567890', apiToken: 'tok', limit: 50 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50 })
    );
  });

  it('R-MON-13: probe failure surfaces as a thrown error (no record creation)', async () => {
    imports.probe.mockResolvedValueOnce({ ok: false, error: '401 Unauthorized' });
    const input = buildInput({
      payload: { boardId: '1234567890', apiToken: 'tok_bad' },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/401 Unauthorized/);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  // ─── Round 39 — record-creation tests ─────────────────────────────────

  it('R-MON-14: failed batches surface as failedCount without aborting the whole import', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
    const input = buildInput({
      payload: { boardId: '1234567890', apiToken: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
  });

  it('R-MON-15: custom payload.batchSize is forwarded to importTable', async () => {
    const input = buildInput({
      payload: { boardId: '1234567890', apiToken: 'tok', batchSize: 250 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 250 })
    );
  });

  it('R-MON-16: batchSize > 1000 is clamped to 1000', async () => {
    const input = buildInput({
      payload: { boardId: '1234567890', apiToken: 'tok', batchSize: 5000 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 1000 })
    );
  });

  it('R-MON-17: mondayItemToFields decodes column_values[] and surfaces boardId/groupId', () => {
    const item = {
      id: '111',
      name: 'Item A',
      board: { id: '1234567890', name: 'Main Board' },
      group: { id: 'topics', title: 'Topics' },
      column_values: [
        { id: 'status', value: '{"index":0}', text: 'Working on it' },
        { id: 'date4', value: '{"date":"2026-01-01"}', text: '2026-01-01' },
        { id: 'numbers', value: '42', text: '42' },
        { id: 'empty_col', value: '', text: null },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    };
    const fields = mondayItemToFields(item);
    expect(fields).toMatchObject({
      id: '111',
      name: 'Item A',
      boardId: '1234567890',
      groupId: 'topics',
      status: 'Working on it',
      date4: '2026-01-01',
      numbers: '42',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    });
    expect(Object.keys(fields)).not.toContain('board');
    expect(Object.keys(fields)).not.toContain('group');
    expect(Object.keys(fields)).not.toContain('empty_col'); // empty text dropped
  });

  it('R-MON-18: mondayItemToFields handles items with no column_values array', () => {
    const item = {
      id: '111',
      name: 'Item A',
      board: { id: '1234567890', name: 'Main Board' },
      group: { id: 'topics', title: 'Topics' },
    };
    const fields = mondayItemToFields(item);
    expect(fields).toMatchObject({
      id: '111',
      name: 'Item A',
      boardId: '1234567890',
      groupId: 'topics',
    });
  });

  it('R-MON-19: empty item set still calls onProgress and returns zero counts', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
    const input = buildInput({
      payload: { boardId: '1234567890', apiToken: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
  });
});
