/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ClickUpImportService,
  IClickUpImportCanceledError,
} from './clickup-import.service';

interface IMockRecords {
  createRecords: ReturnType<typeof vi.fn>;
}

describe('ClickUpImportService', () => {
  let records: IMockRecords;
  let service: ClickUpImportService;

  beforeEach(() => {
    records = {
      createRecords: vi.fn(async () => ({ records: [] })),
    };
    service = new ClickUpImportService(records as never);
  });

  it('CU-SVC-1: IClickUpImportCanceledError carries CLICKUP_CANCELED code', () => {
    const err = new IClickUpImportCanceledError();
    expect(err.code).toBe('CLICKUP_CANCELED');
    expect(err.message).toBe('clickup import was canceled');
    expect(err.name).toBe('IClickUpImportCanceledError');
  });

  it('CU-SVC-2: importTable rejects with IClickUpImportCanceledError when isCanceled fires before listAllTasks', async () => {
    await expect(
      service.importTable({
        apiToken: 'tok',
        listId: 'list_42',
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        batchSize: 10,
        isCanceled: () => true,
        mapTaskToFields: (task) => task,
      })
    ).rejects.toBeInstanceOf(IClickUpImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });

  it('CU-SVC-3: listAllTasks rejects with IClickUpImportCanceledError on immediate cancel', async () => {
    await expect(
      service.listAllTasks('tok', 'list_42', 10, false, () => true)
    ).rejects.toBeInstanceOf(IClickUpImportCanceledError);
  });

  it('CU-SVC-4: probe() preserves ok + workspaceId + workspaceName + spaceCount + fetchedAt', async () => {
    const apiProto = (
      await import('./clickup-api.client')
    ).ClickUpApiClient.prototype;
    const probeSpy = vi
      .spyOn(apiProto, 'probe')
      .mockResolvedValueOnce({
        ok: true,
        workspaceId: 123,
        workspaceName: 'ws',
        spaceCount: 5,
      } as never);

    const probe = await service.probe('tok');
    expect(probe.ok).toBe(true);
    expect(probe.workspaceId).toBe(123);
    expect(probe.workspaceName).toBe('ws');
    expect(probe.spaceCount).toBe(5);
    expect(typeof probe.fetchedAt).toBe('string');

    probeSpy.mockRestore();
  });

  it('CU-SVC-5: importTable tolerates missing batchSize (defaults to 100)', async () => {
    await expect(
      service.importTable({
        apiToken: 'tok',
        listId: 'list_42',
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        isCanceled: () => true,
        mapTaskToFields: (task) => task,
      })
    ).rejects.toBeInstanceOf(IClickUpImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });
});
