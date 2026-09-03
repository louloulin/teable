/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SmartsheetInvalidPayloadError,
  SmartsheetNotConfiguredError,
  SmartsheetSourceDriver,
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

const buildTask = (overrides: IRunInputOverrides = {}): ISourceImportTaskSlice => ({
  id: overrides.tableId ? `task_${overrides.tableId}` : 'task_smartsheet',
  spaceId: overrides.spaceId ?? 'spc_1',
  remoteId: overrides.remoteId ?? 'sheet_42',
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

describe('SmartsheetSourceDriver (Phase 4.4+ stub)', () => {
  let driver: SmartsheetSourceDriver;
  beforeEach(() => { driver = new SmartsheetSourceDriver(); });

  it('R-SSHT-1: source identifier is "smartsheet"', () => {
    expect(driver.source).toBe('smartsheet');
  });
  it('R-SSHT-2: missing spaceId raises SmartsheetInvalidPayloadError', async () => {
    await expect(driver.runImport(buildInput({ spaceId: '' }))).rejects.toMatchObject({ code: 'SMARTSHEET_INVALID_PAYLOAD' });
  });
  it('R-SSHT-3: missing sheetId (no payload, no remoteId) raises SmartsheetInvalidPayloadError', async () => {
    await expect(driver.runImport(buildInput({ remoteId: '', payload: {} }))).rejects.toMatchObject({ code: 'SMARTSHEET_INVALID_PAYLOAD' });
  });
  it('R-SSHT-4: sheetId from payload overrides task.remoteId', async () => {
    try {
      await driver.runImport(buildInput({ remoteId: 'sheet_remote', payload: { sheetId: 'sheet_payload' } }));
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toMatch(/sheet=sheet_payload/);
      expect((e as Error).message).not.toMatch(/sheet=sheet_remote/);
    }
  });
  it('R-SSHT-5: sheetId absent in payload falls back to task.remoteId', async () => {
    try {
      await driver.runImport(buildInput({ remoteId: 'sheet_fb', payload: { pageSize: 500 } }));
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toMatch(/sheet=sheet_fb/);
    }
  });
  it('R-SSHT-6: valid payload throws SmartsheetNotConfiguredError', async () => {
    await expect(driver.runImport(buildInput({ payload: { sheetId: 'sheet_42' } }))).rejects.toBeInstanceOf(SmartsheetNotConfiguredError);
  });
  it('R-SSHT-7: cancel predicate returning true at probe point wins', async () => {
    await expect(driver.runImport(buildInput({ isCanceled: () => true, payload: { sheetId: 'sheet_42' } }))).rejects.toThrow(/SMARTSHEET_CANCELED/);
  });
  it('R-SSHT-8: cancel probe returning false at all probe points means the not-configured error wins', async () => {
    await expect(driver.runImport(buildInput({ payload: { sheetId: 'sheet_42' }, isCanceled: () => false }))).rejects.toBeInstanceOf(SmartsheetNotConfiguredError);
  });
  it('R-SSHT-9: SmartsheetInvalidPayloadError lists missing fields', async () => {
    try {
      await driver.runImport(buildInput({ spaceId: '', remoteId: '', payload: {} }));
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toMatch(/spaceId|sheetId/);
    }
  });
  it('R-SSHT-10: SmartsheetNotConfiguredError mentions page-based pagination + cells[] + columnType', async () => {
    try {
      await driver.runImport(buildInput({ payload: { sheetId: 'sheet_42' } }));
      throw new Error('expected throw');
    } catch (e) {
      const err = e as SmartsheetNotConfiguredError;
      expect(err.remediation).toMatch(/SmartsheetImportService/);
      expect(err.remediation).toMatch(/page/);
      expect(err.remediation).toMatch(/cells/);
      expect(err.remediation).toMatch(/columnType/);
    }
  });
});
