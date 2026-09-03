/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  JiraInvalidPayloadError,
  JiraNotConfiguredError,
  JiraSourceDriver,
  type IJiraTaskPayload,
} from './jira-source.driver';
import type {
  ISourceImportRunInput,
  ISourceImportTaskSlice,
} from './source-import.driver';

interface IRunInputOverrides {
  spaceId?: string;
  remoteId?: string;
  tableId?: string;
  payload?: IJiraTaskPayload;
  isCanceled?: () => boolean;
}

const buildTask = (overrides: IRunInputOverrides = {}): ISourceImportTaskSlice => ({
  id: overrides.tableId ? `task_${overrides.tableId}` : 'task_jira',
  spaceId: overrides.spaceId ?? 'spc_1',
  remoteId: overrides.remoteId ?? 'ENG',
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

describe('JiraSourceDriver (Phase 4.4+ stub)', () => {
  let driver: JiraSourceDriver;

  beforeEach(() => {
    driver = new JiraSourceDriver();
  });

  it('R-JIRA-1: source identifier is "jira"', () => {
    expect(driver.source).toBe('jira');
  });

  it('R-JIRA-2: missing spaceId raises JiraInvalidPayloadError', async () => {
    const input = buildInput({ spaceId: '' });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      JiraInvalidPayloadError
    );
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'JIRA_INVALID_PAYLOAD',
    });
  });

  it('R-JIRA-3: missing projectKey (no payload, no remoteId) raises JiraInvalidPayloadError', async () => {
    const input = buildInput({ remoteId: '', payload: {} });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'JIRA_INVALID_PAYLOAD',
    });
  });

  it('R-JIRA-4: projectKey from payload overrides task.remoteId', async () => {
    const input = buildInput({
      remoteId: 'ENG',
      payload: { projectKey: 'BILL', jql: 'project = BILL' },
    });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(JiraNotConfiguredError);
      expect((e as Error).message).toMatch(/project=BILL/);
      expect((e as Error).message).not.toMatch(/project=ENG/);
    }
  });

  it('R-JIRA-5: projectKey absent in payload falls back to task.remoteId', async () => {
    const input = buildInput({ remoteId: 'OPS', payload: {} });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(JiraNotConfiguredError);
      expect((e as Error).message).toMatch(/project=OPS/);
    }
  });

  it('R-JIRA-6: valid payload throws JiraNotConfiguredError (API client not wired)', async () => {
    const input = buildInput({
      payload: { projectKey: 'ENG', jql: 'project = ENG' },
    });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      JiraNotConfiguredError
    );
  });

  it('R-JIRA-7: cancel predicate returning true at probe point wins', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: { projectKey: 'ENG' },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/JIRA_CANCELED/);
  });

  it('R-JIRA-8: cancel probe returning false at all probe points means the not-configured error wins', async () => {
    const input = buildInput({
      payload: { projectKey: 'ENG' },
      isCanceled: () => false,
    });
    await expect(driver.runImport(input)).rejects.toBeInstanceOf(
      JiraNotConfiguredError
    );
  });

  it('R-JIRA-9: JiraInvalidPayloadError lists missing fields', async () => {
    const input = buildInput({ spaceId: '', remoteId: '', payload: {} });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(JiraInvalidPayloadError);
      expect((e as Error).message).toMatch(/spaceId|projectKey/);
    }
  });

  it('R-JIRA-10: JiraNotConfiguredError mentions ADF + nextPageToken in remediation', async () => {
    const input = buildInput({ payload: { projectKey: 'ENG' } });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(JiraNotConfiguredError);
      const err = e as JiraNotConfiguredError;
      expect(err.remediation).toMatch(/JiraImportService/);
      expect(err.remediation).toMatch(/search\/jql|nextPageToken/);
      expect(err.remediation).toMatch(/ADF/);
    }
  });
});
