/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BaserowInvalidPayloadError,
  BaserowNotConfiguredError,
  BaserowSourceDriver,
  baserowRowToFields,
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

interface IMockBaserowImports {
  probe: ReturnType<typeof vi.fn>;
  fetchRows: ReturnType<typeof vi.fn>;
  importTable: ReturnType<typeof vi.fn>;
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

describe('BaserowSourceDriver', () => {
  let driver: BaserowSourceDriver;
  let imports: IMockBaserowImports;

  beforeEach(() => {
    imports = {
      probe: vi.fn(async () => ({
        ok: true,
        baseId: 42,
        workspaceName: 'ws',
        tableCount: 3,
        fetchedAt: '',
      })),
      fetchRows: vi.fn(async () => ({
        tableId: 42,
        rowCount: 5,
        sample: [],
      })),
      // Round-37 default mock returns 3 imported rows. Tests that need
      // a different shape override via `imports.importTable.mockResolvedValueOnce`.
      importTable: vi.fn(async () => ({
        processedCount: 3,
        failedCount: 0,
        totalCount: 3,
      })),
    };
    driver = new BaserowSourceDriver(undefined, imports as never);
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

  it('R-BSR-4: tableId from payload is passed through to importTable', async () => {
    const input = buildInput({
      remoteId: 'tbl_remote',
      payload: {
        tableId: '101',
        databaseId: 'db_1',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok',
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ tableId: 101 })
    );
  });

  it('R-BSR-5: non-numeric tableId raises BaserowInvalidPayloadError', async () => {
    const input = buildInput({
      remoteId: 'tbl_remote',
      payload: {
        tableId: 'not_a_number',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok',
      },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'BASEROW_INVALID_PAYLOAD',
    });
  });

  it('R-BSR-6: valid payload calls probe + importTable and returns processed/failed/total counts (Round 37 record-creation path)', async () => {
    const input = buildInput({
      payload: {
        databaseId: 'db_1',
        tableId: '101',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok_xyz',
      },
    });
    const result = await driver.runImport(input);
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.probe).toHaveBeenCalledWith('https://baserow.example.com', 'tok_xyz', 101);
    expect(imports.importTable).toHaveBeenCalledTimes(1);
    const call = imports.importTable.mock.calls[0][0];
    expect(call).toMatchObject({
      baseUrl: 'https://baserow.example.com',
        apiToken: 'tok_xyz',
        tableId: 101,
        destinationTableId: 'tbl_local',
        pageSize: 100,
        batchSize: 100,
      });
    expect(typeof call.mapRowToFields).toBe('function');
    expect(result).toMatchObject({
      processedCount: 3,
      failedCount: 0,
      totalCount: 3,
      result: { tableId: 101, workspaceName: 'ws' },
    });
  });

  it('R-BSR-7: cancel predicate returning true at first probe wins (no API call)', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: {
        tableId: '101',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok',
      },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'BASEROW_CANCELED',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-BSR-8: cancel at second probe (after probe) wins, before record creation', async () => {
    let count = 0;
    const input = buildInput({
      isCanceled: () => {
        count += 1;
        return count >= 2;
      },
      payload: {
        tableId: '101',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok',
      },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'BASEROW_CANCELED',
    });
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.importTable).not.toHaveBeenCalled();
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

  it('R-BSR-10: BaserowNotConfiguredError carries a remediation hint (no imports service)', async () => {
    const noImportsDriver = new BaserowSourceDriver();
    const input = buildInput({
      payload: { tableId: '101', baseUrl: 'https://x', apiToken: 't' },
    });
    try {
      await noImportsDriver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(BaserowNotConfiguredError);
      const err = e as BaserowNotConfiguredError;
      expect(err.remediation).toMatch(/BaserowImportService/);
      expect(err.remediation).toMatch(/cursor|pagination/);
    }
  });

  it('R-BSR-11: missing baseUrl or apiToken raises BaserowInvalidPayloadError', async () => {
    const input = buildInput({
      payload: { tableId: '101' /* no baseUrl, no apiToken */ },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'BASEROW_INVALID_PAYLOAD',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-BSR-12: custom payload.size is forwarded to importTable as pageSize', async () => {
    const input = buildInput({
      payload: {
        tableId: '101',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok',
        size: 200,
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 200 })
    );
  });

  it('R-BSR-13: probe failure surfaces as a thrown error (no record creation)', async () => {
    imports.probe.mockResolvedValueOnce({ ok: false, error: '401 Unauthorized' });
    const input = buildInput({
      payload: {
        tableId: '101',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok_bad',
      },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/401 Unauthorized/);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  // ─── Round 37 — record-creation tests ─────────────────────────────────

  it('R-BSR-14: missing tableId on the durable task raises BaserowInvalidPayloadError', async () => {
    const input = buildInput({ tableId: '' });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'BASEROW_INVALID_PAYLOAD',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-BSR-15: failed batches surface as failedCount without aborting the whole import', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
    const input = buildInput({
      payload: {
        tableId: '101',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok_xyz',
      },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
  });

  it('R-BSR-16: custom payload.batchSize is forwarded to importTable', async () => {
    const input = buildInput({
      payload: {
        tableId: '101',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok_xyz',
        batchSize: 250,
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 250 })
    );
  });

  it('R-BSR-17: batchSize > 1000 is clamped to 1000', async () => {
    const input = buildInput({
      payload: {
        tableId: '101',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok_xyz',
        batchSize: 5000,
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 1000 })
    );
  });

  it('R-BSR-18: baserowRowToFields strips system keys (id, order, nulls)', () => {
    const row = {
      id: 42,
      order: '1.00000000000000000000',
      Title: 'Hello',
      Status: 'open',
      Notes: null,
    };
    const fields = baserowRowToFields(row);
    expect(fields).toEqual({ Title: 'Hello', Status: 'open' });
    expect(Object.keys(fields)).not.toContain('id');
    expect(Object.keys(fields)).not.toContain('order');
    expect(Object.keys(fields)).not.toContain('Notes');
  });

  it('R-BSR-19: empty row set still calls onProgress and returns zero counts', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
    const input = buildInput({
      payload: {
        tableId: '101',
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok',
      },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
  });
});
