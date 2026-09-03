/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SmartsheetInvalidPayloadError,
  SmartsheetNotConfiguredError,
  SmartsheetSourceDriver,
  smartsheetRowToFields,
  type ISmartsheetTaskPayload,
} from './smartsheet-source.driver';
import type {
  ISourceImportRunInput,
  ISourceImportTaskSlice,
} from './source-import.driver';

interface IRunInputOverrides {
  spaceId?: string;
  remoteId?: string;
  tableId?: string;
  payload?: ISmartsheetTaskPayload;
  isCanceled?: () => boolean;
}

interface IMockSmartsheetImports {
  probe: ReturnType<typeof vi.fn>;
  listSheets: ReturnType<typeof vi.fn>;
  fetchRowsPage: ReturnType<typeof vi.fn>;
  listAllRows: ReturnType<typeof vi.fn>;
  importTable: ReturnType<typeof vi.fn>;
}

const buildTask = (overrides: IRunInputOverrides = {}): ISourceImportTaskSlice => ({
  id: overrides.tableId ? `task_${overrides.tableId}` : 'task_smartsheet',
  spaceId: overrides.spaceId ?? 'spc_1',
  remoteId: overrides.remoteId ?? '12345',
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

describe('SmartsheetSourceDriver (R21 stub + R42 record-creation)', () => {
  let driver: SmartsheetSourceDriver;
  let imports: IMockSmartsheetImports;

  beforeEach(() => {
    imports = {
      probe: vi.fn(async () => ({
        ok: true,
        sheetCount: 4,
        fetchedAt: '',
      })),
      listSheets: vi.fn(async () => []),
      fetchRowsPage: vi.fn(async () => ({ rows: [], nextPage: null })),
      // R42 default mock returns 3 imported rows.
      listAllRows: vi.fn(async () => []),
      importTable: vi.fn(async () => ({
        processedCount: 3,
        failedCount: 0,
        totalCount: 3,
      })),
    };
    driver = new SmartsheetSourceDriver(undefined, imports as never);
  });

  it('R-SSHT-1: source identifier is "smartsheet"', () => {
    expect(driver.source).toBe('smartsheet');
  });

  it('R-SSHT-2: missing spaceId raises SmartsheetInvalidPayloadError', async () => {
    const input = buildInput({ spaceId: '' });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      SmartsheetInvalidPayloadError
    );
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSHEET_INVALID_PAYLOAD',
    });
  });

  it('R-SSHT-3: missing sheetId (no payload, no remoteId) raises SmartsheetInvalidPayloadError', async () => {
    const input = buildInput({ remoteId: '', payload: {} });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSHEET_INVALID_PAYLOAD',
    });
  });

  it('R-SSHT-4: missing tableId raises SmartsheetInvalidPayloadError (R42 record-creation requirement)', async () => {
    const input = buildInput({ tableId: '' });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSHEET_INVALID_PAYLOAD',
    });
  });

  it('R-SSHT-5: sheetId from payload overrides task.remoteId', async () => {
    const input = buildInput({
      remoteId: '67890',
      payload: { sheetId: '11111', accessToken: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({ result: { sheetId: '11111' } });
  });

  it('R-SSHT-6: valid payload calls probe + importTable (R42 record-creation path)', async () => {
    const input = buildInput({
      payload: { sheetId: '12345', accessToken: 'tok_xyz' },
    });
    const result = await driver.runImport(input);
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.probe).toHaveBeenCalledWith('tok_xyz');
    expect(imports.importTable).toHaveBeenCalledTimes(1);
    const call = imports.importTable.mock.calls[0][0];
    expect(call).toMatchObject({
      apiToken: 'tok_xyz',
      sheetId: 12345,
      destinationTableId: 'tbl_local',
      pageSize: 500,
      batchSize: 100,
    });
    expect(typeof call.mapRowToFields).toBe('function');
    expect(result).toMatchObject({
      processedCount: 3,
      failedCount: 0,
      totalCount: 3,
      result: { sheetId: '12345', sheetCount: 4 },
    });
  });

  it('R-SSHT-7: cancel predicate returning true at first probe wins (no API call)', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: { sheetId: '12345', accessToken: 'tok' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSHEET_CANCELED',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-SSHT-8: cancel at second probe (after probe) wins, before record creation', async () => {
    let count = 0;
    const input = buildInput({
      isCanceled: () => {
        count += 1;
        return count >= 2;
      },
      payload: { sheetId: '12345', accessToken: 'tok' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSHEET_CANCELED',
    });
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-SSHT-9: SmartsheetInvalidPayloadError lists missing fields', async () => {
    try {
      await driver.runImport(buildInput({ spaceId: '', remoteId: '', payload: {} }));
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SmartsheetInvalidPayloadError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/spaceId|sheetId|tableId/);
    }
  });

  it('R-SSHT-10: SmartsheetNotConfiguredError carries a remediation hint (no imports service)', async () => {
    const noImportsDriver = new SmartsheetSourceDriver();
    const input = buildInput({
      payload: { sheetId: '12345', accessToken: 't' },
    });
    try {
      await noImportsDriver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SmartsheetNotConfiguredError);
      const err = e as SmartsheetNotConfiguredError;
      expect(err.remediation).toMatch(/SmartsheetImportService/);
      expect(err.remediation).toMatch(/page/);
      expect(err.remediation).toMatch(/cells/);
      expect(err.remediation).toMatch(/columnType/);
    }
  });

  // ─── Round 42 — record-creation tests ──────────────────────────────────

  it('R-SSHT-11: missing accessToken raises SmartsheetInvalidPayloadError', async () => {
    const input = buildInput({
      payload: { sheetId: '12345' /* no accessToken */ },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSHEET_INVALID_PAYLOAD',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-SSHT-12: non-numeric sheetId raises SmartsheetInvalidPayloadError', async () => {
    const input = buildInput({
      payload: { sheetId: 'not-a-number', accessToken: 'tok' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSHEET_INVALID_PAYLOAD',
    });
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-SSHT-13: custom payload.pageSize is forwarded to importTable', async () => {
    const input = buildInput({
      payload: { sheetId: '12345', accessToken: 'tok', pageSize: 100 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 100 })
    );
  });

  it('R-SSHT-14: probe failure surfaces as a thrown error (no record creation)', async () => {
    imports.probe.mockResolvedValueOnce({ ok: false, error: '401 Unauthorized' });
    const input = buildInput({
      payload: { sheetId: '12345', accessToken: 'tok_bad' },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/401 Unauthorized/);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-SSHT-15: failed batches surface as failedCount without aborting the whole import', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
    const input = buildInput({
      payload: { sheetId: '12345', accessToken: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
  });

  it('R-SSHT-16: custom payload.batchSize is forwarded to importTable', async () => {
    const input = buildInput({
      payload: { sheetId: '12345', accessToken: 'tok', batchSize: 250 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 250 })
    );
  });

  it('R-SSHT-17: batchSize > 1000 is clamped to 1000', async () => {
    const input = buildInput({
      payload: { sheetId: '12345', accessToken: 'tok', batchSize: 5000 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 1000 })
    );
  });

  it('R-SSHT-18: smartsheetRowToFields flattens cells[] into column_<id> keys + surfaces reference columns', () => {
    const row = {
      id: 100,
      sheetId: 42,
      rowNumber: 7,
      createdAt: '2026-01-01T00:00:00Z',
      modifiedAt: '2026-01-02T00:00:00Z',
      cells: [
        { columnId: 1, value: 'Alice', displayValue: 'Alice' },
        { columnId: 2, value: 42, displayValue: '42' },
        { columnId: 3, value: true, displayValue: 'true' },
        { columnId: 4, value: null, displayValue: undefined }, // dropped
        { columnId: undefined, value: 'orphan' }, // dropped (no columnId)
      ],
    };
    const fields = smartsheetRowToFields(row);
    expect(fields).toMatchObject({
      id: 100,
      sheetId: 42,
      rowNumber: 7,
      createdAt: '2026-01-01T00:00:00Z',
      modifiedAt: '2026-01-02T00:00:00Z',
      column_1: 'Alice',
      column_2: '42',
      column_3: 'true',
    });
    expect(Object.keys(fields)).not.toContain('cells'); // envelope flattened
    expect(Object.keys(fields).filter((k) => k.startsWith('column_'))).toHaveLength(3);
  });

  it('R-SSHT-19: smartsheetRowToFields handles rows without cells[] envelope', () => {
    const row = {
      id: 100,
      sheetId: 42,
      rowNumber: 1,
    };
    const fields = smartsheetRowToFields(row);
    expect(fields).toMatchObject({
      id: 100,
      sheetId: 42,
      rowNumber: 1,
    });
    expect(Object.keys(fields)).not.toContain('cells');
  });

  it('R-SSHT-20: empty sheet returns zero counts', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
    const input = buildInput({
      payload: { sheetId: '12345', accessToken: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
  });
});
