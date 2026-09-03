/**
 * AirtableSourceDriver spec — covers the wrap of `AirtableImportService.importBase`
 * so the unified processor can stay generic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AirtableSourceDriver,
  IAirtableImportCanceledError,
  type IAirtableTaskPayload,
} from './airtable-source.driver';
import type {
  AirtableImportService,
  IAirtableImportProgress,
  IAirtableImportProgressReporter,
} from '../airtable-import/airtable-import.service';

interface IServiceMock {
  importBase: ReturnType<typeof vi.fn>;
}

function buildMocks() {
  const fakeVo = {
    base: { id: 'bse1', name: 'imported', spaceId: 'spc1' },
    tables: [],
  };
  const notionImport = {
    importBase: vi.fn(
      async (
        _ro: unknown,
        onProgress?: IAirtableImportProgressReporter
      ): Promise<typeof fakeVo> => {
        // Simulate three progress events and a completed import.
        onProgress?.({ phase: 'fetching_schema' } as IAirtableImportProgress);
        onProgress?.({ phase: 'importing_table', processedRows: 12 } as IAirtableImportProgress);
        onProgress?.({ phase: 'importing_table', processedRows: 80 } as IAirtableImportProgress);
        return fakeVo;
      }
    ),
  } as unknown as AirtableImportService & IServiceMock;
  return { notionImport, fakeVo };
}

describe('AirtableSourceDriver.runImport', () => {
  let svc: AirtableSourceDriver;
  let notionImport: AirtableImportService & IServiceMock;

  beforeEach(() => {
    const mocks = buildMocks();
    notionImport = mocks.notionImport;
    svc = new AirtableSourceDriver(notionImport);
  });

  it('rejects tasks missing spaceId', async () => {
    await expect(
      svc.runImport({
        task: { id: 'x', spaceId: null, tableId: null, remoteId: 'appX' },
        isCanceled: () => false,
      })
    ).rejects.toThrow(/spaceId/);
  });

  it('rejects tasks missing remoteId (airtableBaseId)', async () => {
    await expect(
      svc.runImport({
        task: { id: 'x', spaceId: 'spc', tableId: null, remoteId: null },
        isCanceled: () => false,
      })
    ).rejects.toThrow(/airtableBaseId/);
  });

  it('rejects when payload carries neither accessToken nor integrationId', async () => {
    await expect(
      svc.runImport({
        task: { id: 'x', spaceId: 'spc', tableId: null, remoteId: 'appX', payload: {} },
        isCanceled: () => false,
      })
    ).rejects.toThrow(/accessToken or integrationId/);
  });

  it('forwards credentials + onProgress and returns processed rows', async () => {
    const payload: Record<string, unknown> = {
      accessToken: 'patABC',
      importAttachments: false,
      importViewConfig: false,
      baseName: 'Airtable Imported',
    };
    let progressSeen: Array<{ processedCount: number; failedCount: number; totalCount: number }> = [];
    const out = await svc.runImport({
      task: { id: 'sit_a', spaceId: 'spc1', tableId: null, remoteId: 'appX', payload },
      isCanceled: () => false,
      onProgress: async (counts) => {
        progressSeen.push(counts);
      },
    });
    expect(notionImport.importBase).toHaveBeenCalledTimes(1);
    const args = notionImport.importBase.mock.calls[0] as unknown as [
      Record<string, unknown>,
      IAirtableImportProgressReporter,
    ];
    expect(args[0]['spaceId']).toBe('spc1');
    expect(args[0]['airtableBaseId']).toBe('appX');
    expect(args[0]['accessToken']).toBe('patABC');
    expect(args[0]['importAttachments']).toBe(false);
    expect(args[0]['baseName']).toBe('Airtable Imported');
    expect(typeof args[1]).toBe('function');
    expect(out.processedCount).toBe(80);
    expect(out.totalCount).toBe(80);
    // Only events with processedRows are reported as counts
    expect(progressSeen.length).toBeGreaterThanOrEqual(2);
  });

  it('throws IAirtableImportCanceledError mid-import when isCanceled fires', async () => {
    notionImport.importBase.mockImplementationOnce(
      async (
        _ro: unknown,
        onProgress?: IAirtableImportProgressReporter
      ): Promise<unknown> => {
        onProgress?.({ phase: 'fetching_schema' } as IAirtableImportProgress);
        onProgress?.({ phase: 'importing_table', processedRows: 5 } as IAirtableImportProgress);
        throw new IAirtableImportCanceledError();
      }
    );
    await expect(
      svc.runImport({
        task: {
          id: 'sit_b',
          spaceId: 'spc1',
          tableId: null,
          remoteId: 'appX',
          payload: { integrationId: 'intg1' } as Record<string, unknown>,
        },
        // The driver's polling `isCanceled` simply forwards this flag; for
        // this test we rely on the explicit throw inside the wrapper to
        // simulate the cancel hot path.
        isCanceled: () => true,
      })
    ).rejects.toBeInstanceOf(IAirtableImportCanceledError);
  });

  it('honors isCanceled by polling between table-progress events', async () => {
    let cancelFlag = false;
    notionImport.importBase.mockImplementationOnce(
      async (
        _ro: unknown,
        onProgress?: IAirtableImportProgressReporter
      ): Promise<unknown> => {
        onProgress?.({ phase: 'importing_table', processedRows: 5 } as IAirtableImportProgress);
        // Once cancelFlag becomes true, the next non-ignored phase throws.
        cancelFlag = true;
        onProgress?.({
          phase: 'finalizing_table',
          processedRows: 10,
        } as IAirtableImportProgress);
        return { base: { id: 'bse1' }, tables: [] };
      }
    );
    await expect(
      svc.runImport({
        task: {
          id: 'sit_c',
          spaceId: 'spc1',
          tableId: null,
          remoteId: 'appX',
          payload: { accessToken: 'pat' } as Record<string, unknown>,
        },
        isCanceled: () => cancelFlag,
      })
    ).rejects.toBeInstanceOf(IAirtableImportCanceledError);
  });
});
