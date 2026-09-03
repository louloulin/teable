/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ISmartsheetImportCanceledError,
  SmartsheetImportService,
} from './smartsheet-import.service';

interface IMockRecords {
  createRecords: ReturnType<typeof vi.fn>;
}

describe('SmartsheetImportService', () => {
  let records: IMockRecords;
  let service: SmartsheetImportService;

  beforeEach(() => {
    records = {
      createRecords: vi.fn(async () => ({ records: [] })),
    };
    service = new SmartsheetImportService(records as never);
  });

  it('SSHT-SVC-1: ISmartsheetImportCanceledError carries SMARTSHEET_CANCELED code', () => {
    const err = new ISmartsheetImportCanceledError();
    expect(err.code).toBe('SMARTSHEET_CANCELED');
    expect(err.message).toBe('smartsheet import was canceled');
    expect(err.name).toBe('ISmartsheetImportCanceledError');
  });

  it('SSHT-SVC-2: importTable rejects with ISmartsheetImportCanceledError when isCanceled fires before listAllRows', async () => {
    await expect(
      service.importTable({
        apiToken: 'tok',
        sheetId: 42,
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        batchSize: 10,
        isCanceled: () => true,
        mapRowToFields: (row) => row,
      })
    ).rejects.toBeInstanceOf(ISmartsheetImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });

  it('SSHT-SVC-3: listAllRows rejects with ISmartsheetImportCanceledError on immediate cancel', async () => {
    await expect(
      service.listAllRows('tok', 42, 10, () => true)
    ).rejects.toBeInstanceOf(ISmartsheetImportCanceledError);
  });

  it('SSHT-SVC-4: probe() preserves ok + sheetCount + user + fetchedAt', async () => {
    const apiProto = (
      await import('./smartsheet-api.client')
    ).SmartsheetApiClient.prototype;
    const probeSpy = vi
      .spyOn(apiProto, 'probe')
      .mockResolvedValueOnce({
        ok: true,
        sheetCount: 4,
        user: { id: 1, email: 'u@example.com' },
      } as never);

    const probe = await service.probe('tok');
    expect(probe.ok).toBe(true);
    expect(probe.sheetCount).toBe(4);
    expect(probe.user).toEqual({ id: 1, email: 'u@example.com' });
    expect(typeof probe.fetchedAt).toBe('string');

    probeSpy.mockRestore();
  });

  it('SSHT-SVC-5: importTable rejects non-numeric sheetId', async () => {
    await expect(
      service.importTable({
        apiToken: 'tok',
        sheetId: 'not-a-number' as unknown as number,
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        isCanceled: () => false,
        mapRowToFields: (row) => row,
      })
    ).rejects.toThrow(/sheetId must be numeric/);

    expect(records.createRecords).not.toHaveBeenCalled();
  });

  it('SSHT-SVC-6: importTable tolerates missing batchSize (defaults to 100)', async () => {
    // Stub the API client to short-circuit listAllRows to empty so the
    // batchSize default path runs without a real HTTP fetch.
    const apiProto = (
      await import('./smartsheet-api.client')
    ).SmartsheetApiClient.prototype;
    const listSpy = vi
      .spyOn(apiProto, 'listRows')
      .mockResolvedValueOnce({ rows: [], nextPage: null } as never);

    const result = await service.importTable({
      apiToken: 'tok',
      sheetId: 42,
      destinationTableId: 'tbl_dest',
      pageSize: 10,
      isCanceled: () => false,
      mapRowToFields: (row) => row,
    });
    expect(result.processedCount).toBe(0);
    expect(result.failedCount).toBe(0);
    expect(result.totalCount).toBe(0);

    listSpy.mockRestore();
  });
});
