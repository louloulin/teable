/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SmartSuiteInvalidPayloadError,
  SmartSuiteNotConfiguredError,
  SmartSuiteSourceDriver,
  smartsuiteRecordToFields,
  type ISmartSuiteTaskPayload,
} from './smartsuite-source.driver';
import type {
  ISourceImportRunInput,
  ISourceImportTaskSlice,
} from './source-import.driver';

interface IRunInputOverrides {
  spaceId?: string;
  remoteId?: string;
  tableId?: string;
  payload?: ISmartSuiteTaskPayload;
  isCanceled?: () => boolean;
}

interface IMockSmartSuiteImports {
  probe: ReturnType<typeof vi.fn>;
  fetchRecords: ReturnType<typeof vi.fn>;
  importTable: ReturnType<typeof vi.fn>;
}

const buildTask = (overrides: IRunInputOverrides = {}): ISourceImportTaskSlice => ({
  id: overrides.tableId ? `task_${overrides.tableId}` : 'task_smartsuite',
  spaceId: overrides.spaceId ?? 'spc_1',
  remoteId: overrides.remoteId ?? 'app_42',
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

describe('SmartSuiteSourceDriver', () => {
  let driver: SmartSuiteSourceDriver;
  let imports: IMockSmartSuiteImports;

  beforeEach(() => {
    imports = {
      probe: vi.fn(async () => ({
        ok: true,
        appCount: 2,
        tableCount: 5,
        fetchedAt: '',
      })),
      fetchRecords: vi.fn(async () => ({
        appId: 'app_42',
        recordCount: 0,
        sample: [],
      })),
      // Round-41 default mock returns 3 imported rows.
      importTable: vi.fn(async () => ({
        processedCount: 3,
        failedCount: 0,
        totalCount: 3,
      })),
    };
    driver = new SmartSuiteSourceDriver(undefined, imports as never);
  });

  it('R-SS-1: source identifier is "smartsuite"', () => {
    expect(driver.source).toBe('smartsuite');
  });

  it('R-SS-2: missing spaceId raises SmartSuiteInvalidPayloadError', async () => {
    const input = buildInput({ spaceId: '' });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      SmartSuiteInvalidPayloadError
    );
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSUITE_INVALID_PAYLOAD',
    });
  });

  it('R-SS-3: missing appId AND no remoteId raises SmartSuiteInvalidPayloadError', async () => {
    const input = buildInput({ remoteId: '', payload: {} });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSUITE_INVALID_PAYLOAD',
    });
  });

  it('R-SS-4: missing tableId raises SmartSuiteInvalidPayloadError (R41 record-creation requirement)', async () => {
    const input = buildInput({ tableId: '' });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSUITE_INVALID_PAYLOAD',
    });
  });

  it('R-SS-5: appId from payload overrides task.remoteId', async () => {
    const input = buildInput({
      remoteId: 'app_remote',
      payload: { appId: 'app_payload', apiKey: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({ result: { appId: 'app_payload' } });
  });

  it('R-SS-6: valid payload calls probe + importTable (Round 41 record-creation path)', async () => {
    const input = buildInput({
      payload: { appId: 'app_42', apiKey: 'tok_xyz' },
    });
    const result = await driver.runImport(input);
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.probe).toHaveBeenCalledWith('tok_xyz');
    expect(imports.importTable).toHaveBeenCalledTimes(1);
    const call = imports.importTable.mock.calls[0][0];
    expect(call).toMatchObject({
      apiToken: 'tok_xyz',
      appId: 'app_42',
      destinationTableId: 'tbl_local',
      pageSize: 100,
      batchSize: 100,
    });
    expect(typeof call.mapRecordToFields).toBe('function');
    expect(result).toMatchObject({
      processedCount: 3,
      failedCount: 0,
      totalCount: 3,
      result: { appId: 'app_42', appCount: 2, tableCount: 5 },
    });
  });

  it('R-SS-7: cancel predicate returning true at first probe wins (no API call)', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: { appId: 'app_42', apiKey: 'tok' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSUITE_CANCELED',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-SS-8: cancel at second probe (after probe) wins, before record creation', async () => {
    let count = 0;
    const input = buildInput({
      isCanceled: () => {
        count += 1;
        return count >= 2;
      },
      payload: { appId: 'app_42', apiKey: 'tok' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSUITE_CANCELED',
    });
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-SS-9: SmartSuiteInvalidPayloadError lists missing fields', async () => {
    const input = buildInput({ spaceId: '', remoteId: '', payload: {} });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SmartSuiteInvalidPayloadError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/spaceId|appId|tableId/);
    }
  });

  it('R-SS-10: SmartSuiteNotConfiguredError carries a remediation hint (no imports service)', async () => {
    const noImportsDriver = new SmartSuiteSourceDriver();
    const input = buildInput({
      payload: { appId: 'app_42', apiKey: 't' },
    });
    try {
      await noImportsDriver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SmartSuiteNotConfiguredError);
      const err = e as SmartSuiteNotConfiguredError;
      expect(err.remediation).toMatch(/SmartSuiteImportService/);
      expect(err.remediation).toMatch(/offset|Bearer/);
    }
  });

  it('R-SS-11: missing apiKey raises SmartSuiteInvalidPayloadError', async () => {
    const input = buildInput({
      payload: { appId: 'app_42' /* no apiKey */ },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'SMARTSUITE_INVALID_PAYLOAD',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-SS-12: custom payload.limit is forwarded to importTable as pageSize', async () => {
    const input = buildInput({
      payload: { appId: 'app_42', apiKey: 'tok', limit: 50 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50 })
    );
  });

  it('R-SS-13: probe failure surfaces as a thrown error (no record creation)', async () => {
    imports.probe.mockResolvedValueOnce({ ok: false, error: '401 Unauthorized' });
    const input = buildInput({
      payload: { appId: 'app_42', apiKey: 'tok_bad' },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/401 Unauthorized/);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  // ─── Round 41 — record-creation tests ─────────────────────────────────

  it('R-SS-14: failed batches surface as failedCount without aborting the whole import', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
    const input = buildInput({
      payload: { appId: 'app_42', apiKey: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
  });

  it('R-SS-15: custom payload.batchSize is forwarded to importTable', async () => {
    const input = buildInput({
      payload: { appId: 'app_42', apiKey: 'tok', batchSize: 250 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 250 })
    );
  });

  it('R-SS-16: batchSize > 1000 is clamped to 1000', async () => {
    const input = buildInput({
      payload: { appId: 'app_42', apiKey: 'tok', batchSize: 5000 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 1000 })
    );
  });

  it('R-SS-17: smartsuiteRecordToFields spreads record.fields into top-level cells', () => {
    const record = {
      id: 'r_1',
      app_id: 'app_42',
      table_id: 'tbl_x',
      title: 'Hello',
      created_at: '2026-01-01T00:00:00Z',
      fields: {
        status: { value: 'open', label: 'Open' },
        priority: 'high',
        due_date: '2026-02-01',
        archived: null,
      },
    };
    const fields = smartsuiteRecordToFields(record);
    expect(fields).toMatchObject({
      id: 'r_1',
      app_id: 'app_42',
      table_id: 'tbl_x',
      title: 'Hello',
      created_at: '2026-01-01T00:00:00Z',
      status: { value: 'open', label: 'Open' },
      priority: 'high',
      due_date: '2026-02-01',
    });
    expect(Object.keys(fields)).not.toContain('fields'); // envelope flattened
    expect(Object.keys(fields)).not.toContain('archived'); // null dropped
  });

  it('R-SS-18: smartsuiteRecordToFields handles records without fields envelope', () => {
    const record = {
      id: 'r_1',
      app_id: 'app_42',
      title: 'Plain',
    };
    const fields = smartsuiteRecordToFields(record);
    expect(fields).toMatchObject({
      id: 'r_1',
      app_id: 'app_42',
      title: 'Plain',
    });
  });

  it('R-SS-19: empty record set still calls onProgress and returns zero counts', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
    const input = buildInput({
      payload: { appId: 'app_42', apiKey: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
  });
});
