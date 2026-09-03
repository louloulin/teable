/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SmartSuiteInvalidPayloadError,
  SmartSuiteNotConfiguredError,
  SmartSuiteSourceDriver,
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

describe('SmartSuiteSourceDriver (Phase 4.4+ stub)', () => {
  let driver: SmartSuiteSourceDriver;
  beforeEach(() => { driver = new SmartSuiteSourceDriver(); });

  it('R-SS-1: source identifier is "smartsuite"', () => {
    expect(driver.source).toBe('smartsuite');
  });
  it('R-SS-2: missing spaceId raises SmartSuiteInvalidPayloadError', async () => {
    await expect(driver.runImport(buildInput({ spaceId: '' }))).rejects.toMatchObject({ code: 'SMARTSUITE_INVALID_PAYLOAD' });
  });
  it('R-SS-3: missing appId (no payload, no remoteId) raises SmartSuiteInvalidPayloadError', async () => {
    await expect(driver.runImport(buildInput({ remoteId: '', payload: {} }))).rejects.toMatchObject({ code: 'SMARTSUITE_INVALID_PAYLOAD' });
  });
  it('R-SS-4: appId from payload overrides task.remoteId', async () => {
    try {
      await driver.runImport(buildInput({ remoteId: 'app_remote', payload: { appId: 'app_payload', solutionId: 'sol_1' } }));
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SmartSuiteNotConfiguredError);
      expect((e as Error).message).toMatch(/app=app_payload/);
      expect((e as Error).message).not.toMatch(/app=app_remote/);
    }
  });
  it('R-SS-5: appId absent in payload falls back to task.remoteId', async () => {
    try {
      await driver.runImport(buildInput({ remoteId: 'app_fb', payload: { limit: 100 } }));
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toMatch(/app=app_fb/);
    }
  });
  it('R-SS-6: valid payload throws SmartSuiteNotConfiguredError', async () => {
    await expect(driver.runImport(buildInput({ payload: { appId: 'app_42' } }))).rejects.toBeInstanceOf(SmartSuiteNotConfiguredError);
  });
  it('R-SS-7: cancel predicate returning true at probe point wins', async () => {
    await expect(driver.runImport(buildInput({ isCanceled: () => true, payload: { appId: 'app_42' } }))).rejects.toThrow(/SMARTSUITE_CANCELED/);
  });
  it('R-SS-8: cancel probe returning false at all probe points means the not-configured error wins', async () => {
    await expect(driver.runImport(buildInput({ payload: { appId: 'app_42' }, isCanceled: () => false }))).rejects.toBeInstanceOf(SmartSuiteNotConfiguredError);
  });
  it('R-SS-9: SmartSuiteInvalidPayloadError lists missing fields', async () => {
    try {
      await driver.runImport(buildInput({ spaceId: '', remoteId: '', payload: {} }));
      throw new Error('expected throw');
    } catch (e) {
      expect((e as Error).message).toMatch(/spaceId|appId/);
    }
  });
  it('R-SS-10: SmartSuiteNotConfiguredError mentions Token auth + offset + field_values', async () => {
    try {
      await driver.runImport(buildInput({ payload: { appId: 'app_42' } }));
      throw new Error('expected throw');
    } catch (e) {
      const err = e as SmartSuiteNotConfiguredError;
      expect(err.remediation).toMatch(/SmartSuiteImportService/);
      expect(err.remediation).toMatch(/Token/);
      expect(err.remediation).toMatch(/offset/);
      expect(err.remediation).toMatch(/field_values/);
    }
  });
});
