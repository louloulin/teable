/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BaserowInvalidPayloadError,
  BaserowNotConfiguredError,
  BaserowSourceDriver,
  type IBaserowTaskPayload,
} from './baserow-source.driver';
import type {
  ISourceImportRunInput,
  ISourceImportTaskSlice,
} from './source-import.driver';

interface IRunInputOverrides {
  spaceId?: string;
  remoteId?: string;
  tableId?: string;
  payload?: IBaserowTaskPayload;
  isCanceled?: () => boolean;
}

const buildTask = (overrides: IRunInputOverrides = {}): ISourceImportTaskSlice => ({
  id: overrides.tableId ? `task_${overrides.tableId}` : 'task_baserow',
  spaceId: overrides.spaceId ?? 'spc_1',
  remoteId: overrides.remoteId ?? 'tbl_baserow_42',
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

describe('BaserowSourceDriver (Phase 4.4+ stub)', () => {
  let driver: BaserowSourceDriver;

  beforeEach(() => {
    driver = new BaserowSourceDriver();
  });

  it('R-BSR-1: source identifier is "baserow"', () => {
    expect(driver.source).toBe('baserow');
  });

  it('R-BSR-2: missing spaceId raises BaserowInvalidPayloadError', async () => {
    const input = buildInput({ spaceId: '' });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      BaserowInvalidPayloadError
    );
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'BASEROW_INVALID_PAYLOAD',
    });
  });

  it('R-BSR-3: missing remoteId AND no payload.tableId raises BaserowInvalidPayloadError', async () => {
    const input = buildInput({ remoteId: '', payload: {} });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'BASEROW_INVALID_PAYLOAD',
    });
  });

  it('R-BSR-4: tableId from payload overrides task.remoteId', async () => {
    const input = buildInput({
      remoteId: 'tbl_remote',
      payload: { tableId: 'tbl_payload', databaseId: 'db_1' },
    });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BaserowNotConfiguredError);
      // The error message must reference the payload table id, not remoteId.
      expect((e as Error).message).toMatch(/table=tbl_payload/);
      expect((e as Error).message).not.toMatch(/table=tbl_remote/);
    }
  });

  it('R-BSR-5: tableId absent in payload falls back to task.remoteId', async () => {
    const input = buildInput({
      remoteId: 'tbl_remote_fallback',
      payload: { databaseId: 'db_1' },
    });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BaserowNotConfiguredError);
      expect((e as Error).message).toMatch(/table=tbl_remote_fallback/);
    }
  });

  it('R-BSR-6: valid payload throws BaserowNotConfiguredError (API client not wired)', async () => {
    const input = buildInput({
      payload: { databaseId: 'db_1', tableId: 'tbl_x' },
    });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      BaserowNotConfiguredError
    );
  });

  it('R-BSR-7: cancel predicate returning true at probe point wins', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: { tableId: 'tbl_x' },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/BASEROW_CANCELED/);
  });

  it('R-BSR-8: cancel probe returning false at all probe points means the not-configured error wins', async () => {
    const input = buildInput({
      payload: { tableId: 'tbl_x' },
      isCanceled: () => false,
    });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      BaserowNotConfiguredError
    );
  });

  it('R-BSR-9: BaserowInvalidPayloadError lists missing fields', async () => {
    const input = buildInput({ spaceId: '', remoteId: '', payload: {} });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BaserowInvalidPayloadError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/spaceId|remoteId|tableId/);
    }
  });

  it('R-BSR-10: BaserowNotConfiguredError carries a remediation hint', async () => {
    const input = buildInput({ payload: { tableId: 'tbl_x' } });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BaserowNotConfiguredError);
      const err = e as BaserowNotConfiguredError;
      expect(err.remediation).toMatch(/BaserowImportService/);
      expect(err.remediation).toMatch(/cursor|pagination/);
    }
  });
});
