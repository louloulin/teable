/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MondayInvalidPayloadError,
  MondayNotConfiguredError,
  MondaySourceDriver,
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

describe('MondaySourceDriver (Phase 4.4+ stub)', () => {
  let driver: MondaySourceDriver;

  beforeEach(() => {
    driver = new MondaySourceDriver();
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

  it('R-MON-3: missing boardId (no payload, no remoteId) raises MondayInvalidPayloadError', async () => {
    const input = buildInput({ remoteId: '', payload: {} });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'MONDAY_INVALID_PAYLOAD',
    });
  });

  it('R-MON-4: boardId from payload overrides task.remoteId', async () => {
    const input = buildInput({
      remoteId: '1111111111',
      payload: { boardId: '2222222222', groupId: 'topics' },
    });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(MondayNotConfiguredError);
      expect((e as Error).message).toMatch(/board=2222222222/);
      expect((e as Error).message).not.toMatch(/board=1111111111/);
    }
  });

  it('R-MON-5: boardId absent in payload falls back to task.remoteId', async () => {
    const input = buildInput({ remoteId: '9999999999', payload: { limit: 50 } });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(MondayNotConfiguredError);
      expect((e as Error).message).toMatch(/board=9999999999/);
    }
  });

  it('R-MON-6: valid payload throws MondayNotConfiguredError (GraphQL client not wired)', async () => {
    const input = buildInput({ payload: { boardId: '1234567890' } });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      MondayNotConfiguredError
    );
  });

  it('R-MON-7: cancel predicate returning true at probe point wins', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: { boardId: '1234567890' },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/MONDAY_CANCELED/);
  });

  it('R-MON-8: cancel probe returning false at all probe points means the not-configured error wins', async () => {
    const input = buildInput({
      payload: { boardId: '1234567890' },
      isCanceled: () => false,
    });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      MondayNotConfiguredError
    );
  });

  it('R-MON-9: MondayInvalidPayloadError lists missing fields', async () => {
    const input = buildInput({ spaceId: '', remoteId: '', payload: {} });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(MondayInvalidPayloadError);
      expect((e as Error).message).toMatch(/spaceId|boardId/);
    }
  });

  it('R-MON-10: MondayNotConfiguredError mentions GraphQL + column_values + cursor in remediation', async () => {
    const input = buildInput({ payload: { boardId: '1234567890' } });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(MondayNotConfiguredError);
      const err = e as MondayNotConfiguredError;
      expect(err.remediation).toMatch(/GraphQL/);
      expect(err.remediation).toMatch(/column_values/);
      expect(err.remediation).toMatch(/cursor/);
    }
  });
});
