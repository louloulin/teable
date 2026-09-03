/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BaserowImportService,
  IBaserowImportCanceledError,
} from './baserow-import.service';

interface IMockRecords {
  createRecords: ReturnType<typeof vi.fn>;
}

describe('BaserowImportService', () => {
  let records: IMockRecords;
  let service: BaserowImportService;

  beforeEach(() => {
    records = {
      createRecords: vi.fn(async () => ({ records: [] })),
    };
    service = new BaserowImportService(records as never);
  });

  it('BSR-SVC-1: IBaserowImportCanceledError carries BASEROW_CANCELED code', () => {
    const err = new IBaserowImportCanceledError();
    expect(err.code).toBe('BASEROW_CANCELED');
    expect(err.message).toBe('baserow import was canceled');
    expect(err.name).toBe('IBaserowImportCanceledError');
  });

  it('BSR-SVC-2: importTable rejects with IBaserowImportCanceledError when isCanceled fires before listAllRows', async () => {
    await expect(
      service.importTable({
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok',
        tableId: 42,
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        batchSize: 10,
        isCanceled: () => true,
        mapRowToFields: (row) => row,
      })
    ).rejects.toBeInstanceOf(IBaserowImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });

  it('BSR-SVC-3: listAllRows rejects with IBaserowImportCanceledError on immediate cancel', async () => {
    await expect(
      service.listAllRows(
        'https://baserow.example.com',
        'tok',
        42,
        10,
        () => true
      )
    ).rejects.toBeInstanceOf(IBaserowImportCanceledError);
  });

  it('BSR-SVC-4: probe() preserves ok + baseId + workspaceName + tableCount + fetchedAt', async () => {
    const apiProto = (
      await import('./baserow-api.client')
    ).BaserowApiClient.prototype;
    const listWorkspacesSpy = vi
      .spyOn(apiProto, 'probe')
      .mockResolvedValueOnce({
        ok: true,
        workspaceName: 'ws',
        tableCount: 5,
      } as never);

    const probe = await service.probe('https://baserow.example.com', 'tok', 42);
    expect(probe.ok).toBe(true);
    expect(probe.baseId).toBe(42);
    expect(probe.workspaceName).toBe('ws');
    expect(probe.tableCount).toBe(5);
    expect(typeof probe.fetchedAt).toBe('string');

    listWorkspacesSpy.mockRestore();
  });

  it('BSR-SVC-5: importTable tolerates missing batchSize (defaults to 100)', async () => {
    await expect(
      service.importTable({
        baseUrl: 'https://baserow.example.com',
        apiToken: 'tok',
        tableId: 42,
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        isCanceled: () => true,
        mapRowToFields: (row) => row,
      })
    ).rejects.toBeInstanceOf(IBaserowImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });
});
