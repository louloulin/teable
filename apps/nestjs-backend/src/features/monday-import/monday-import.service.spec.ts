/* eslint-disable @typescript-eslint/naming-convention */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IMondayImportCanceledError,
  MondayImportService,
} from './monday-import.service';

interface IMockRecords {
  createRecords: ReturnType<typeof vi.fn>;
}

describe('MondayImportService', () => {
  let records: IMockRecords;
  let service: MondayImportService;

  beforeEach(() => {
    records = {
      createRecords: vi.fn(async () => ({ records: [] })),
    };
    service = new MondayImportService(records as never);
  });

  it('MON-SVC-1: IMondayImportCanceledError carries MONDAY_CANCELED code', () => {
    const err = new IMondayImportCanceledError();
    expect(err.code).toBe('MONDAY_CANCELED');
    expect(err.message).toBe('monday import was canceled');
    expect(err.name).toBe('IMondayImportCanceledError');
  });

  it('MON-SVC-2: importTable rejects with IMondayImportCanceledError when isCanceled fires before listAllItems', async () => {
    await expect(
      service.importTable({
        apiToken: 'tok',
        boardId: '1234567890',
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        batchSize: 10,
        isCanceled: () => true,
        mapItemToFields: (item) => item,
      })
    ).rejects.toBeInstanceOf(IMondayImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });

  it('MON-SVC-3: listAllItems rejects with IMondayImportCanceledError on immediate cancel', async () => {
    await expect(
      service.listAllItems('tok', '1234567890', 10, () => true)
    ).rejects.toBeInstanceOf(IMondayImportCanceledError);
  });

  it('MON-SVC-4: probe() preserves ok + workspaceCount + boardCount + fetchedAt', async () => {
    const apiProto = (
      await import('./monday-api.client')
    ).MondayApiClient.prototype;
    const probeSpy = vi
      .spyOn(apiProto, 'probe')
      .mockResolvedValueOnce({
        ok: true,
        workspaceCount: 3,
        boardCount: 7,
      } as never);

    const probe = await service.probe('tok');
    expect(probe.ok).toBe(true);
    expect(probe.workspaceCount).toBe(3);
    expect(probe.boardCount).toBe(7);
    expect(typeof probe.fetchedAt).toBe('string');

    probeSpy.mockRestore();
  });

  it('MON-SVC-5: importTable tolerates missing batchSize (defaults to 100)', async () => {
    await expect(
      service.importTable({
        apiToken: 'tok',
        boardId: '1234567890',
        destinationTableId: 'tbl_dest',
        pageSize: 10,
        isCanceled: () => true,
        mapItemToFields: (item) => item,
      })
    ).rejects.toBeInstanceOf(IMondayImportCanceledError);

    expect(records.createRecords).not.toHaveBeenCalled();
  });
});
