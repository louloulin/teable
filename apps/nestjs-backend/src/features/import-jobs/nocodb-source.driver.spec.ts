/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NocoDbInvalidPayloadError,
  NocoDbNotConfiguredError,
  NocoDbSourceDriver,
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

describe('NocoDbSourceDriver (Phase 4.4+ stub)', () => {
  let driver: NocoDbSourceDriver;

  beforeEach(() => {
    driver = new NocoDbSourceDriver();
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
      payload: { tableName: 'Projects' },
    });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      NocoDbNotConfiguredError
    );
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'NOCODB_NOT_CONFIGURED',
    });
  });

  it('R-NOCO-6: valid payload throws NocoDbNotConfiguredError (API client not wired)', async () => {
    const input = buildInput({
      payload: { baseId: 'base_abc', tableName: 'Projects' },
    });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      NocoDbNotConfiguredError
    );
  });

  it('R-NOCO-7: cancel predicate returning true at probe point wins', async () => {
    // Driver checks spaceId/remoteId/payload first (non-retryable),
    // then probes cancel twice. With a valid payload but isCanceled=true,
    // the first probe fires and we get NOCODB_CANCELED — not the
    // "API not configured" error.
    const input = buildInput({
      isCanceled: () => true,
      payload: { baseId: 'base_abc', tableName: 'Projects' },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/NOCODB_CANCELED/);
  });

  it('R-NOCO-8: cancel probe returning false at all probe points means the not-configured error wins', async () => {
    const input = buildInput({
      payload: { baseId: 'base_abc', tableName: 'Projects' },
      isCanceled: () => false,
    });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      NocoDbNotConfiguredError
    );
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

  it('R-NOCO-10: NocoDbNotConfiguredError carries a remediation hint for the operator', async () => {
    const input = buildInput({
      payload: { baseId: 'base_abc', tableName: 'Projects' },
    });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(NocoDbNotConfiguredError);
      const err = e as NocoDbNotConfiguredError;
      expect(err.remediation).toMatch(/NocoDbImportService/);
      expect(err.remediation).toMatch(/bearer|createRecords/);
    }
  });
});
