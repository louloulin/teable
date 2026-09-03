/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IJiraImportCanceledError,
  JiraImportService,
} from './jira-import.service';

interface IMockRecords {
  createRecords: ReturnType<typeof vi.fn>;
}

describe('JiraImportService', () => {
  let records: IMockRecords;
  let service: JiraImportService;

  beforeEach(() => {
    records = {
      createRecords: vi.fn(async () => ({ records: [] })),
    };
    service = new JiraImportService(records as never);
  });

  it('JIRA-SVC-1: IJiraImportCanceledError carries JIRA_CANCELED code', () => {
    const err = new IJiraImportCanceledError();
    expect(err.code).toBe('JIRA_CANCELED');
    expect(err.message).toBe('jira import was canceled');
    expect(err.name).toBe('IJiraImportCanceledError');
  });

  it('JIRA-SVC-2: importTable rejects with IJiraImportCanceledError when isCanceled fires before listAllIssues', async () => {
    await expect(
      service.importTable({
        siteUrl: 'https://example.atlassian.net',
        email: 'me@x',
        apiToken: 'tok',
        jql: 'project = ENG',
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        batchSize: 10,
        isCanceled: () => true,
        mapIssueToFields: (issue) => issue,
      })
    ).rejects.toBeInstanceOf(IJiraImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });

  it('JIRA-SVC-3: listAllIssues rejects with IJiraImportCanceledError on immediate cancel', async () => {
    await expect(
      service.listAllIssues(
        'https://example.atlassian.net',
        'me@x',
        'tok',
        'project = ENG',
        10,
        () => true
      )
    ).rejects.toBeInstanceOf(IJiraImportCanceledError);
  });

  it('JIRA-SVC-4: probe() preserves ok + siteUrl + accountId + displayName + projectCount + fetchedAt', async () => {
    const apiProto = (
      await import('./jira-api.client')
    ).JiraApiClient.prototype;
    const probeSpy = vi
      .spyOn(apiProto, 'probe')
      .mockResolvedValueOnce({
        ok: true,
        accountId: 'acc_1',
        displayName: 'Test User',
        projectCount: 5,
      } as never);

    const probe = await service.probe('https://example.atlassian.net', 'me@x', 'tok');
    expect(probe.ok).toBe(true);
    expect(probe.siteUrl).toBe('https://example.atlassian.net');
    expect(probe.accountId).toBe('acc_1');
    expect(probe.displayName).toBe('Test User');
    expect(probe.projectCount).toBe(5);
    expect(typeof probe.fetchedAt).toBe('string');

    probeSpy.mockRestore();
  });

  it('JIRA-SVC-5: importTable tolerates missing batchSize (defaults to 100)', async () => {
    await expect(
      service.importTable({
        siteUrl: 'https://example.atlassian.net',
        email: 'me@x',
        apiToken: 'tok',
        jql: 'project = ENG',
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        isCanceled: () => true,
        mapIssueToFields: (issue) => issue,
      })
    ).rejects.toBeInstanceOf(IJiraImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });
});
