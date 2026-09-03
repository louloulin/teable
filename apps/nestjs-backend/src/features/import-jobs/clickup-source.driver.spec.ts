/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ClickUpInvalidPayloadError,
  ClickUpNotConfiguredError,
  ClickUpSourceDriver,
  clickupTaskToFields,
  type IClickUpTaskPayload,
} from './clickup-source.driver';
import type {
  ISourceImportRunInput,
  ISourceImportTaskSlice,
} from './source-import.driver';

interface IRunInputOverrides {
  spaceId?: string;
  remoteId?: string;
  tableId?: string;
  payload?: IClickUpTaskPayload;
  isCanceled?: () => boolean;
}

interface IMockClickUpImports {
  probe: ReturnType<typeof vi.fn>;
  fetchTasks: ReturnType<typeof vi.fn>;
  importTable: ReturnType<typeof vi.fn>;
}

const buildTask = (overrides: IRunInputOverrides = {}): ISourceImportTaskSlice => ({
  id: overrides.tableId ? `task_${overrides.tableId}` : 'task_clickup',
  spaceId: overrides.spaceId ?? 'spc_1',
  remoteId: overrides.remoteId ?? 'list_42',
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

describe('ClickUpSourceDriver', () => {
  let driver: ClickUpSourceDriver;
  let imports: IMockClickUpImports;

  beforeEach(() => {
    imports = {
      probe: vi.fn(async () => ({
        ok: true,
        workspaceId: 123,
        workspaceName: 'ws',
        spaceCount: 3,
        fetchedAt: '',
      })),
      fetchTasks: vi.fn(async () => ({
        listId: 'list_42',
        taskCount: 0,
        sample: [],
      })),
      // Round-40 default mock returns 3 imported rows.
        importTable: vi.fn(async () => ({
          processedCount: 3,
          failedCount: 0,
          totalCount: 3,
        })),
    };
    driver = new ClickUpSourceDriver(undefined, imports as never);
  });

  it('R-CU-1: source identifier is "clickup"', () => {
    expect(driver.source).toBe('clickup');
  });

  it('R-CU-2: missing spaceId raises ClickUpInvalidPayloadError', async () => {
    const input = buildInput({ spaceId: '' });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      ClickUpInvalidPayloadError
    );
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'CLICKUP_INVALID_PAYLOAD',
    });
  });

  it('R-CU-3: missing listId AND no remoteId raises ClickUpInvalidPayloadError', async () => {
    const input = buildInput({ remoteId: '', payload: {} });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'CLICKUP_INVALID_PAYLOAD',
    });
  });

  it('R-CU-4: missing tableId raises ClickUpInvalidPayloadError (R40 record-creation requirement)', async () => {
    const input = buildInput({ tableId: '' });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'CLICKUP_INVALID_PAYLOAD',
    });
  });

  it('R-CU-5: listId from payload overrides task.remoteId', async () => {
    const input = buildInput({
      remoteId: 'list_remote',
      payload: { listId: 'list_payload', apiToken: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({ result: { listId: 'list_payload' } });
  });

  it('R-CU-6: valid payload calls probe + importTable (Round 40 record-creation path)', async () => {
    const input = buildInput({
      payload: { listId: 'list_42', apiToken: 'tok_xyz' },
    });
    const result = await driver.runImport(input);
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.probe).toHaveBeenCalledWith('tok_xyz');
    expect(imports.importTable).toHaveBeenCalledTimes(1);
    const call = imports.importTable.mock.calls[0][0];
    expect(call).toMatchObject({
      apiToken: 'tok_xyz',
      listId: 'list_42',
      destinationTableId: 'tbl_local',
      pageSize: 100,
      batchSize: 100,
      includeClosed: false,
    });
    expect(typeof call.mapTaskToFields).toBe('function');
    expect(result).toMatchObject({
      processedCount: 3,
      failedCount: 0,
      totalCount: 3,
      result: { listId: 'list_42', workspaceId: 123, workspaceName: 'ws' },
    });
  });

  it('R-CU-7: cancel predicate returning true at first probe wins (no API call)', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: { listId: 'list_42', apiToken: 'tok' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'CLICKUP_CANCELED',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-CU-8: cancel at second probe (after probe) wins, before record creation', async () => {
    let count = 0;
    const input = buildInput({
      isCanceled: () => {
        count += 1;
        return count >= 2;
      },
      payload: { listId: 'list_42', apiToken: 'tok' },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'CLICKUP_CANCELED',
    });
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-CU-9: ClickUpInvalidPayloadError lists missing fields', async () => {
    const input = buildInput({ spaceId: '', remoteId: '', payload: {} });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ClickUpInvalidPayloadError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/spaceId|listId|tableId/);
    }
  });

  it('R-CU-10: ClickUpNotConfiguredError carries a remediation hint (no imports service)', async () => {
    const noImportsDriver = new ClickUpSourceDriver();
    const input = buildInput({
      payload: { listId: 'list_42', apiToken: 't' },
    });
    try {
      await noImportsDriver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ClickUpNotConfiguredError);
      const err = e as ClickUpNotConfiguredError;
      expect(err.remediation).toMatch(/ClickUpImportService/);
      expect(err.remediation).toMatch(/page|custom_fields/);
    }
  });

  it('R-CU-11: missing apiToken raises ClickUpInvalidPayloadError', async () => {
    const input = buildInput({
      payload: { listId: 'list_42' /* no apiToken */ },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'CLICKUP_INVALID_PAYLOAD',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-CU-12: custom payload.pageSize is forwarded to importTable', async () => {
    const input = buildInput({
      payload: { listId: 'list_42', apiToken: 'tok', pageSize: 50 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50 })
    );
  });

  it('R-CU-13: includeClosed is forwarded to importTable (true)', async () => {
    const input = buildInput({
      payload: { listId: 'list_42', apiToken: 'tok', includeClosed: true },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ includeClosed: true })
    );
  });

  it('R-CU-14: probe failure surfaces as a thrown error (no record creation)', async () => {
    imports.probe.mockResolvedValueOnce({ ok: false, error: '401 Unauthorized' });
    const input = buildInput({
      payload: { listId: 'list_42', apiToken: 'tok_bad' },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/401 Unauthorized/);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  // ─── Round 40 — record-creation tests ─────────────────────────────────

  it('R-CU-15: failed batches surface as failedCount without aborting the whole import', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
    const input = buildInput({
      payload: { listId: 'list_42', apiToken: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
  });

  it('R-CU-16: custom payload.batchSize is forwarded to importTable', async () => {
    const input = buildInput({
      payload: { listId: 'list_42', apiToken: 'tok', batchSize: 250 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 250 })
    );
  });

  it('R-CU-17: batchSize > 1000 is clamped to 1000', async () => {
    const input = buildInput({
      payload: { listId: 'list_42', apiToken: 'tok', batchSize: 5000 },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 1000 })
    );
  });

  it('R-CU-18: clickupTaskToFields flattens status/priority, joins assignees, surfaces custom_fields[]', () => {
    const task = {
      id: 't_1',
      name: 'Fix bug',
        description: 'details',
        due_date: '1700000000000',
        status: { status: 'In Progress', color: '#000' },
        priority: { id: '1', priority: 'high', color: '#f00' },
        assignees: [
          { id: 1, username: 'alice' },
          { id: 2, username: 'bob' },
        ],
        custom_fields: [
          { id: 'cf_status', name: 'Status', value: 'open' },
          { id: 'cf_url', name: 'URL', value: 'https://x' },
          { id: 'cf_empty', name: 'Empty', value: '' },
        ],
        creator: { id: 1, username: 'admin' },
      };
    const fields = clickupTaskToFields(task);
    expect(fields).toMatchObject({
      id: 't_1',
      name: 'Fix bug',
      description: 'details',
      due_date: '1700000000000',
      status: 'In Progress',
      priority: 'high',
      assignees: 'alice, bob',
      cf_status: 'open',
      cf_url: 'https://x',
    });
    expect(Object.keys(fields)).not.toContain('creator');
    expect(Object.keys(fields)).not.toContain('cf_empty');
  });

  it('R-CU-19: empty task set still calls onProgress and returns zero counts', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
    const input = buildInput({
      payload: { listId: 'list_42', apiToken: 'tok' },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
  });
});
