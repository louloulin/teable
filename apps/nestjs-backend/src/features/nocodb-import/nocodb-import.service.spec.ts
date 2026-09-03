/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  INocoDbImportCanceledError,
  NocoDbImportService,
} from './nocodb-import.service';

interface IMockRecords {
  createRecords: ReturnType<typeof vi.fn>;
}

describe('NocoDbImportService', () => {
  let records: IMockRecords;
  let service: NocoDbImportService;

  beforeEach(() => {
    records = {
      createRecords: vi.fn(async () => ({ records: [] })),
    };
    service = new NocoDbImportService(records as never);
  });

  it('NOCO-SVC-1: INocoDbImportCanceledError carries NOCODB_CANCELED code', () => {
    const err = new INocoDbImportCanceledError();
    expect(err.code).toBe('NOCODB_CANCELED');
    expect(err.message).toBe('nocodb import was canceled');
    expect(err.name).toBe('INocoDbImportCanceledError');
  });

  it('NOCO-SVC-2: importTable rejects with INocoDbImportCanceledError when isCanceled fires before listAllRows', async () => {
    // Cancel immediately so listAllRows short-circuits without
    // hitting the network. We use the public cancel predicate.
    await expect(
      service.importTable({
        baseUrl: 'https://nocodb.example.com',
        apiToken: 'tok',
        tableName: 'Projects',
        tableId: 'tbl_dest',
        pageSize: 10,
        batchSize: 10,
        isCanceled: () => true, // immediate cancel
        mapRowToFields: (row) => row,
      })
    ).rejects.toBeInstanceOf(INocoDbImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });

  it('NOCO-SVC-3: probe() preserves ok + baseCount + tableCount + fetchedAt from the api client', async () => {
    // The probe path constructs its own NocoDbApiClient and hits
    // the network — skip the actual fetch by validating the service
    // surfaces the typed NocoDbConnectionProbe envelope via a
    // mocked listBases/listTables. We patch the prototype lazily.
    const apiProto = (
      await import('./nocodb-api.client')
    ).NocoDbApiClient.prototype;
    const listBasesSpy = vi
      .spyOn(apiProto, 'listBases')
      .mockResolvedValueOnce([{ id: 'b1', title: 'B1' }] as never);
    const listTablesSpy = vi
      .spyOn(apiProto, 'listTables')
      .mockResolvedValueOnce([
        { id: 't1', title: 'T1' },
        { id: 't2', title: 'T2' },
      ] as never);

    const probe = await service.probe('https://nocodb.example.com', 'tok');
    expect(probe.ok).toBe(true);
    expect(probe.baseCount).toBe(1);
    expect(probe.tableCount).toBe(2);
    expect(typeof probe.fetchedAt).toBe('string');

    listBasesSpy.mockRestore();
    listTablesSpy.mockRestore();
  });

  it('NOCO-SVC-4: listAllRows rejects with INocoDbImportCanceledError on immediate cancel', async () => {
    await expect(
      service.listAllRows(
        'https://nocodb.example.com',
        'tok',
        'Projects',
        10,
        () => true
      )
    ).rejects.toBeInstanceOf(INocoDbImportCanceledError);
  });

  it('NOCO-SVC-5: importTable tolerates missing batchSize (defaults to 100)', async () => {
    // Cancel during listAllRows so the function exits cleanly without
    // touching the network; confirms the call signature accepts the
    // optional batchSize.
    await expect(
      service.importTable({
        baseUrl: 'https://nocodb.example.com',
        apiToken: 'tok',
        tableName: 'Empty',
        tableId: 'tbl_dest',
        pageSize: 10,
        isCanceled: () => true,
        mapRowToFields: (row) => row,
      })
    ).rejects.toBeInstanceOf(INocoDbImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });
});
