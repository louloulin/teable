/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ClickUpInvalidPayloadError,
  ClickUpNotConfiguredError,
  ClickUpSourceDriver,
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

describe('ClickUpSourceDriver (Phase 4.4+ stub)', () => {
  let driver: ClickUpSourceDriver;

  beforeEach(() => {
    driver = new ClickUpSourceDriver();
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

  it('R-CU-3: missing listId (no payload, no remoteId) raises ClickUpInvalidPayloadError', async () => {
    const input = buildInput({ remoteId: '', payload: {} });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'CLICKUP_INVALID_PAYLOAD',
    });
  });

  it('R-CU-4: listId from payload overrides task.remoteId', async () => {
    const input = buildInput({
      remoteId: 'list_remote',
      payload: { listId: 'list_payload', folderId: 'folder_1' },
    });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ClickUpNotConfiguredError);
      expect((e as Error).message).toMatch(/list=list_payload/);
      expect((e as Error).message).not.toMatch(/list=list_remote/);
    }
  });

  it('R-CU-5: listId absent in payload falls back to task.remoteId', async () => {
    const input = buildInput({ remoteId: 'list_fb', payload: { includeClosed: true } });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ClickUpNotConfiguredError);
      expect((e as Error).message).toMatch(/list=list_fb/);
    }
  });

  it('R-CU-6: valid payload throws ClickUpNotConfiguredError (REST client not wired)', async () => {
    const input = buildInput({ payload: { listId: 'list_42', folderId: 'folder_1' } });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      ClickUpNotConfiguredError
    );
  });

  it('R-CU-7: cancel predicate returning true at probe point wins', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: { listId: 'list_42' },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/CLICKUP_CANCELED/);
  });

  it('R-CU-8: cancel probe returning false at all probe points means the not-configured error wins', async () => {
    const input = buildInput({
      payload: { listId: 'list_42' },
      isCanceled: () => false,
    });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      ClickUpNotConfiguredError
    );
  });

  it('R-CU-9: ClickUpInvalidPayloadError lists missing fields', async () => {
    const input = buildInput({ spaceId: '', remoteId: '', payload: {} });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ClickUpInvalidPayloadError);
      expect((e as Error).message).toMatch(/spaceId|listId/);
    }
  });

  it('R-CU-10: ClickUpNotConfiguredError mentions custom_fields + page pagination + comments in remediation', async () => {
    const input = buildInput({ payload: { listId: 'list_42' } });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ClickUpNotConfiguredError);
      const err = e as ClickUpNotConfiguredError;
      expect(err.remediation).toMatch(/ClickUpImportService/);
      expect(err.remediation).toMatch(/custom_fields/);
      expect(err.remediation).toMatch(/last_page/);
      expect(err.remediation).toMatch(/comment/);
    }
  });
});
