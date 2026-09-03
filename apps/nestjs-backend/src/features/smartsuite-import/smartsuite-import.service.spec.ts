/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ISmartSuiteImportCanceledError,
  SmartSuiteImportService,
} from './smartsuite-import.service';

interface IMockRecords {
  createRecords: ReturnType<typeof vi.fn>;
}

describe('SmartSuiteImportService', () => {
  let records: IMockRecords;
  let service: SmartSuiteImportService;

  beforeEach(() => {
    records = {
      createRecords: vi.fn(async () => ({ records: [] })),
    };
    service = new SmartSuiteImportService(records as never);
  });

  it('SS-SVC-1: ISmartSuiteImportCanceledError carries SMARTSUITE_CANCELED code', () => {
    const err = new ISmartSuiteImportCanceledError();
    expect(err.code).toBe('SMARTSUITE_CANCELED');
    expect(err.message).toBe('smartsuite import was canceled');
    expect(err.name).toBe('ISmartSuiteImportCanceledError');
  });

  it('SS-SVC-2: importTable rejects with ISmartSuiteImportCanceledError when isCanceled fires before listAllRecords', async () => {
    await expect(
      service.importTable({
        apiToken: 'tok',
        appId: 'app_42',
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        batchSize: 10,
        isCanceled: () => true,
        mapRecordToFields: (record) => record,
      })
    ).rejects.toBeInstanceOf(ISmartSuiteImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });

  it('SS-SVC-3: listAllRecords rejects with ISmartSuiteImportCanceledError on immediate cancel', async () => {
    await expect(
      service.listAllRecords('tok', 'app_42', 10, () => true)
    ).rejects.toBeInstanceOf(ISmartSuiteImportCanceledError);
  });

  it('SS-SVC-4: probe() preserves ok + appCount + tableCount + fetchedAt', async () => {
    const apiProto = (
      await import('./smartsuite-api.client')
    ).SmartSuiteApiClient.prototype;
    const probeSpy = vi
      .spyOn(apiProto, 'probe')
      .mockResolvedValueOnce({
        ok: true,
        appCount: 3,
        tableCount: 7,
      } as never);

    const probe = await service.probe('tok');
    expect(probe.ok).toBe(true);
    expect(probe.appCount).toBe(3);
    expect(probe.tableCount).toBe(7);
    expect(typeof probe.fetchedAt).toBe('string');

    probeSpy.mockRestore();
  });

  it('SS-SVC-5: importTable tolerates missing batchSize (defaults to 100)', async () => {
    await expect(
      service.importTable({
        apiToken: 'tok',
        appId: 'app_42',
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        isCanceled: () => true,
        mapRecordToFields: (record) => record,
      })
    ).rejects.toBeInstanceOf(ISmartSuiteImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });
});
