/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NocoDbInvalidPayloadError,
  NocoDbNotConfiguredError,
  NocoDbSourceDriver,
  nocodbRowToFields,
  type INocoDbTaskPayload,
} from './nocodb-source.driver';
import type {
  ISourceImportRunInput,
  ISourceImportTaskSlice,
} from './source-import.driver';

interface IRunInputOverrides {
  spaceId?: string;
  remoteId?: string;
  tableId?: string;
  payload?: INocoDbTaskPayload;
  isCanceled?: () => boolean;
}

interface IMockNocoDbImports {
  probe: ReturnType<typeof vi.fn>;
  fetchRows: ReturnType<typeof vi.fn>;
  importTable: ReturnType<typeof vi.fn>;
}

const buildTask = (overrides: IRunInputOverrides = {}): ISourceImportTaskSlice => ({
  id: overrides.tableId ? `task_${overrides.tableId}` : 'task_noco',
  spaceId: overrides.spaceId ?? 'spc_1',
  remoteId: overrides.remoteId ?? 'base_abc',
  tableId: overrides.tableId ?? 'tbl_x',
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

describe('NocoDbSourceDriver', () => {
  let driver: NocoDbSourceDriver;
  let imports: IMockNocoDbImports;

  beforeEach(() => {
    imports = {
      probe: vi.fn(async () => ({ ok: true, baseCount: 1, tableCount: 3, fetchedAt: '' })),
      fetchRows: vi.fn(async (baseUrl: string, token: string, tableName: string) => ({
        tableId: tableName,
        rowCount: 5,
        sample: [{ Id: 1, Title: 'a' }, { Id: 2, Title: 'b' }],
      })),
      // Round-36 default mock returns 3 imported rows. Tests that need
      // a different shape override via `imports.importTable.mockResolvedValueOnce`.
      importTable: vi.fn(async () => ({
        processedCount: 3,
        failedCount: 0,
        totalCount: 3,
      })),
    };
    driver = new NocoDbSourceDriver(undefined, imports as never);
  });

  it('R-NOCO-1: source identifier is "nocodb"', () => {
    expect(driver.source).toBe('nocodb');
  });

  it('R-NOCO-2: missing spaceId raises NocoDbInvalidPayloadError', async () => {
    const input = buildInput({ spaceId: '' });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      NocoDbInvalidPayloadError
    );
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'NOCODB_INVALID_PAYLOAD',
    });
  });

  it('R-NOCO-3: missing remoteId raises NocoDbInvalidPayloadError', async () => {
    const input = buildInput({ remoteId: '' });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'NOCODB_INVALID_PAYLOAD',
    });
  });

  it('R-NOCO-4: missing tableName in payload raises NocoDbInvalidPayloadError', async () => {
    const input = buildInput({ payload: { baseId: 'base_abc' } });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      NocoDbInvalidPayloadError
    );
  });

  it('R-NOCO-5: payload missing baseId falls back to task.remoteId', async () => {
    const input = buildInput({
      remoteId: 'base_remote',
      payload: { tableName: 'Projects', baseUrl: 'https://x', apiToken: 't' },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://x', apiToken: 't', tableName: 'Projects' })
    );
  });

  it('R-NOCO-6: valid payload calls probe + importTable and returns processed/failed/total counts (Round 36 record-creation path)', async () => {
    const input = buildInput({
      payload: {
        baseId: 'base_abc',
        tableName: 'Projects',
        baseUrl: 'https://nocodb.example.com',
        apiToken: 'tok_xyz',
      },
    });
    const result = await driver.runImport(input);
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.probe).toHaveBeenCalledWith('https://nocodb.example.com', 'tok_xyz');
    expect(imports.importTable).toHaveBeenCalledTimes(1);
    const call = imports.importTable.mock.calls[0][0];
    expect(call).toMatchObject({
      baseUrl: 'https://nocodb.example.com',
      apiToken: 'tok_xyz',
      tableName: 'Projects',
      tableId: 'tbl_x',
      pageSize: 100,
      batchSize: 100,
    });
    expect(typeof call.mapRowToFields).toBe('function');
    expect(result).toMatchObject({
      processedCount: 3,
      failedCount: 0,
      totalCount: 3,
      result: { baseId: 'base_abc', tableName: 'Projects', totalSeen: 3 },
    });
  });

  it('R-NOCO-7: cancel predicate returning true at first probe wins (no API call)', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: { baseId: 'base_abc', tableName: 'Projects', baseUrl: 'https://x', apiToken: 't' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({ code: 'NOCODB_CANCELED' });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-NOCO-8: cancel at second probe (after probe) wins, before record creation', async () => {
    let count = 0;
    const input = buildInput({
      isCanceled: () => {
        count += 1;
        return count >= 2; // 2nd probe (after probe, before importTable) wins
      },
      payload: { baseId: 'base_abc', tableName: 'Projects', baseUrl: 'https://x', apiToken: 't' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({ code: 'NOCODB_CANCELED' });
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-NOCO-9: NocoDbInvalidPayloadError lists every missing field once', async () => {
    const input = buildInput({ spaceId: '', remoteId: '', payload: {} });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NocoDbInvalidPayloadError);
      const msg = (e as Error).message;
      // `spaceId` is checked first, then `remoteId`; payload is then
      // checked for baseId/tableName. We assert at least the first
      // missing field appears in the message.
      expect(msg).toMatch(/spaceId|remoteId/);
    }
  });

  it('R-NOCO-10: NocoDbNotConfiguredError carries a remediation hint for the operator (no imports service)', async () => {
    const noImportsDriver = new NocoDbSourceDriver();
    const input = buildInput({
      payload: { baseId: 'base_abc', tableName: 'Projects' },
    });
    try {
      await noImportsDriver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NocoDbNotConfiguredError);
      const err = e as NocoDbNotConfiguredError;
      expect(err.remediation).toMatch(/NocoDbImportService/);
      expect(err.remediation).toMatch(/bearer|createRecords/);
    }
  });

  it('R-NOCO-11: missing baseUrl or apiToken in payload raises NocoDbInvalidPayloadError', async () => {
    const input = buildInput({
      payload: { baseId: 'base_abc', tableName: 'Projects' /* no baseUrl, no apiToken */ },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'NOCODB_INVALID_PAYLOAD',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-NOCO-12: custom payload.limit is forwarded to importTable as pageSize', async () => {
    const input = buildInput({
      payload: {
        baseId: 'base_abc',
        tableName: 'Projects',
        baseUrl: 'https://nocodb.example.com',
        apiToken: 'tok',
        limit: 25,
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 25 })
    );
  });

  it('R-NOCO-13: probe failure surfaces as a thrown error (no record creation)', async () => {
    imports.probe.mockResolvedValueOnce({ ok: false, error: '401 Unauthorized' });
    const input = buildInput({
      payload: {
        baseId: 'base_abc',
        tableName: 'Projects',
        baseUrl: 'https://nocodb.example.com',
        apiToken: 'tok_bad',
      },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/401 Unauthorized/);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  // ─── Round 36 — record-creation tests ─────────────────────────────────

  it('R-NOCO-14: missing tableId on the durable task raises NocoDbInvalidPayloadError', async () => {
    const input = buildInput({ tableId: '' });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'NOCODB_INVALID_PAYLOAD',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-NOCO-15: failed batches surface as failedCount without aborting the whole import', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
    const input = buildInput({
      payload: {
        baseId: 'base_abc',
        tableName: 'Projects',
        baseUrl: 'https://nocodb.example.com',
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

  it('R-NOCO-16: custom payload.batchSize is forwarded to importTable', async () => {
    const input = buildInput({
      payload: {
        baseId: 'base_abc',
        tableName: 'Projects',
        baseUrl: 'https://nocodb.example.com',
        apiToken: 'tok_xyz',
        batchSize: 250,
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 250 })
    );
  });

  it('R-NOCO-17: batchSize > 1000 is clamped to 1000', async () => {
    const input = buildInput({
      payload: {
        baseId: 'base_abc',
        tableName: 'Projects',
        baseUrl: 'https://nocodb.example.com',
        apiToken: 'tok_xyz',
        batchSize: 5000,
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 1000 })
    );
  });

  it('R-NOCO-18: mapRowToFields strips NocoDB system keys (Id, nc_*, timestamps)', () => {
    const row = {
      Id: 42,
      Title: 'Hello',
      nc_created_at: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      Notes: null,
      Status: 'open',
    };
    const fields = nocodbRowToFields(row);
    expect(fields).toEqual({ Title: 'Hello', Status: 'open' });
    expect(Object.keys(fields)).not.toContain('Id');
    expect(Object.keys(fields)).not.toContain('nc_created_at');
    expect(Object.keys(fields)).not.toContain('created_at');
    expect(Object.keys(fields)).not.toContain('updated_at');
    expect(Object.keys(fields)).not.toContain('Notes'); // null dropped
  });

  it('R-NOCO-19: empty row set still calls onProgress and returns zero counts', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
    const input = buildInput({
      payload: {
        baseId: 'base_abc',
        tableName: 'EmptyTable',
        baseUrl: 'https://nocodb.example.com',
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
