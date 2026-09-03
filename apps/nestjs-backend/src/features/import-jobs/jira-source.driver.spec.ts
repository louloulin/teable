/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  JiraInvalidPayloadError,
  JiraNotConfiguredError,
  JiraSourceDriver,
  jiraIssueToFields,
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

interface IMockJiraImports {
  probe: ReturnType<typeof vi.fn>;
  fetchIssues: ReturnType<typeof vi.fn>;
  importTable: ReturnType<typeof vi.fn>;
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

describe('JiraSourceDriver', () => {
  let driver: JiraSourceDriver;
  let imports: IMockJiraImports;

  beforeEach(() => {
    imports = {
      probe: vi.fn(async () => ({
        ok: true,
        siteUrl: 'https://example.atlassian.net',
        accountId: 'acc_1',
        displayName: 'Test User',
        projectCount: 3,
        fetchedAt: '',
      })),
      fetchIssues: vi.fn(async () => ({
        jql: 'project = ENG',
        issueCount: 0,
        sample: [],
      })),
      // Round-38 default mock returns 3 imported rows.
      importTable: vi.fn(async () => ({
        processedCount: 3,
        failedCount: 0,
        totalCount: 3,
      })),
    };
    driver = new JiraSourceDriver(undefined, imports as never);
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

  it('R-JIRA-3: missing projectKey AND no remoteId raises JiraInvalidPayloadError', async () => {
    const input = buildInput({ remoteId: '', payload: {} });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'JIRA_INVALID_PAYLOAD',
    });
  });

  it('R-JIRA-4: missing tableId raises JiraInvalidPayloadError (R38 record-creation requirement)', async () => {
    const input = buildInput({ tableId: '' });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'JIRA_INVALID_PAYLOAD',
    });
  });

  it('R-JIRA-5: projectKey from payload overrides task.remoteId', async () => {
    const input = buildInput({
      remoteId: 'REMOTE',
      payload: {
        projectKey: 'PAYLOAD',
        siteUrl: 'https://x.atlassian.net',
        email: 'me@example.com',
        apiToken: 'tok',
      },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({ result: { projectKey: 'PAYLOAD' } });
  });

  it('R-JIRA-6: valid payload calls probe + importTable (Round 38 record-creation path)', async () => {
    const input = buildInput({
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://example.atlassian.net',
        email: 'me@example.com',
        apiToken: 'tok_xyz',
      },
    });
    const result = await driver.runImport(input);
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.probe).toHaveBeenCalledWith(
      'https://example.atlassian.net',
      'me@example.com',
      'tok_xyz'
    );
    expect(imports.importTable).toHaveBeenCalledTimes(1);
    const call = imports.importTable.mock.calls[0][0];
    expect(call).toMatchObject({
      siteUrl: 'https://example.atlassian.net',
      email: 'me@example.com',
      apiToken: 'tok_xyz',
      jql: 'project = ENG ORDER BY created DESC',
      destinationTableId: 'tbl_local',
      pageSize: 100,
      batchSize: 100,
    });
    expect(typeof call.mapIssueToFields).toBe('function');
    expect(result).toMatchObject({
      processedCount: 3,
      failedCount: 0,
      totalCount: 3,
      result: { projectKey: 'ENG', displayName: 'Test User' },
    });
  });

  it('R-JIRA-7: cancel predicate returning true at first probe wins (no API call)', async () => {
    const input = buildInput({
      isCanceled: () => true,
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://x.atlassian.net',
        email: 'me@x',
        apiToken: 'tok',
      },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'JIRA_CANCELED',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-JIRA-8: cancel at second probe (after probe) wins, before record creation', async () => {
    let count = 0;
    const input = buildInput({
      isCanceled: () => {
        count += 1;
        return count >= 2;
      },
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://x.atlassian.net',
        email: 'me@x',
        apiToken: 'tok',
      },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'JIRA_CANCELED',
    });
    expect(imports.probe).toHaveBeenCalledTimes(1);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-JIRA-9: JiraInvalidPayloadError lists missing fields', async () => {
    const input = buildInput({ spaceId: '', remoteId: '', payload: {} });
    try {
      await driver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(JiraInvalidPayloadError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/spaceId|projectKey|tableId/);
    }
  });

  it('R-JIRA-10: JiraNotConfiguredError carries a remediation hint (no imports service)', async () => {
    const noImportsDriver = new JiraSourceDriver();
    const input = buildInput({
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://x',
        email: 'me@x',
        apiToken: 't',
      },
    });
    try {
      await noImportsDriver.runImport(input);
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(JiraNotConfiguredError);
      const err = e as JiraNotConfiguredError;
      expect(err.remediation).toMatch(/JiraImportService/);
      expect(err.remediation).toMatch(/search|jql/);
    }
  });

  it('R-JIRA-11: missing siteUrl/email/apiToken raises JiraInvalidPayloadError', async () => {
    const input = buildInput({
      payload: { projectKey: 'ENG' /* no siteUrl, email, apiToken */ },
    });
    await expect(driver.runImport(input)).rejects.toMatchObject({
      code: 'JIRA_INVALID_PAYLOAD',
    });
    expect(imports.probe).not.toHaveBeenCalled();
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  it('R-JIRA-12: custom payload.jql overrides the default ORDER BY created DESC', async () => {
    const input = buildInput({
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://example.atlassian.net',
        email: 'me@x',
        apiToken: 'tok',
        jql: 'project = ENG AND type = Bug',
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ jql: 'project = ENG AND type = Bug' })
    );
  });

  it('R-JIRA-13: custom payload.maxResults is forwarded as pageSize', async () => {
    const input = buildInput({
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://example.atlassian.net',
        email: 'me@x',
        apiToken: 'tok',
        maxResults: 50,
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50 })
    );
  });

  it('R-JIRA-14: probe failure surfaces as a thrown error (no record creation)', async () => {
    imports.probe.mockResolvedValueOnce({ ok: false, error: '401 Unauthorized' });
    const input = buildInput({
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://example.atlassian.net',
        email: 'me@x',
        apiToken: 'tok_bad',
      },
    });
    await expect(driver.runImport(input)).rejects.toThrow(/401 Unauthorized/);
    expect(imports.importTable).not.toHaveBeenCalled();
  });

  // ─── Round 38 — record-creation tests ─────────────────────────────────

  it('R-JIRA-15: failed batches surface as failedCount without aborting the whole import', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
    const input = buildInput({
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://example.atlassian.net',
        email: 'me@x',
        apiToken: 'tok',
      },
    });
    const result = await driver.runImport(input);
    expect(result).toMatchObject({
      processedCount: 2,
      failedCount: 1,
      totalCount: 3,
    });
  });

  it('R-JIRA-16: custom payload.batchSize is forwarded to importTable', async () => {
    const input = buildInput({
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://example.atlassian.net',
        email: 'me@x',
        apiToken: 'tok',
        batchSize: 250,
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 250 })
    );
  });

  it('R-JIRA-17: batchSize > 1000 is clamped to 1000', async () => {
    const input = buildInput({
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://example.atlassian.net',
        email: 'me@x',
        apiToken: 'tok',
        batchSize: 5000,
      },
    });
    await driver.runImport(input);
    expect(imports.importTable).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 1000 })
    );
  });

  it('R-JIRA-18: jiraIssueToFields flattens issue.fields into top-level columns', () => {
    const issue = {
      id: '10001',
      key: 'ENG-1',
      self: 'https://example.atlassian.net/rest/api/3/issue/10001',
      expand: 'operations,versionedRepresentations',
      fields: {
        summary: 'Fix the bug',
        description: { type: 'doc', version: 1, content: [] },
        priority: { name: 'High', id: '2' },
        status: { name: 'Open', id: '1' },
        Notes: null,
      },
    };
    const fields = jiraIssueToFields(issue);
    expect(fields).toMatchObject({
      id: '10001',
      key: 'ENG-1',
      summary: 'Fix the bug',
      priority: { name: 'High', id: '2' },
      status: { name: 'Open', id: '1' },
    });
    expect(Object.keys(fields)).not.toContain('self');
    expect(Object.keys(fields)).not.toContain('expand');
    expect(Object.keys(fields)).not.toContain('Notes'); // null dropped
  });

  it('R-JIRA-19: empty issue set still calls onProgress and returns zero counts', async () => {
    imports.importTable.mockResolvedValueOnce({
      processedCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
    const input = buildInput({
      payload: {
        projectKey: 'ENG',
        siteUrl: 'https://example.atlassian.net',
        email: 'me@x',
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
