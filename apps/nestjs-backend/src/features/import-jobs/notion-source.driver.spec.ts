/**
 * NotionSourceDriver spec — covers the runImport adapter path so the
 * unified processor can stay generic.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotionSourceDriver } from './notion-source.driver';
import { INotionImportCanceledError } from '../notion/notion-import.service';
import type { NotionImportService } from '../notion/notion-import.service';
import type { NotionOAuthService } from '../notion/notion-oauth.service';

function buildMocks() {
  const notionImport = {
    importDatabase: vi.fn(async () => ({ imported: 42, skipped: 3 })),
  } as unknown as NotionImportService & {
    importDatabase: ReturnType<typeof vi.fn>;
  };
  const oauth = {
    getStoredTokens: vi.fn(async () => ({
      spaceId: 'spX',
      accessToken: 'tok',
      lastEditedTime: undefined,
    })),
    updateLastEditedTime: vi.fn(async () => undefined),
  } as unknown as NotionOAuthService & {
    getStoredTokens: ReturnType<typeof vi.fn>;
    updateLastEditedTime: ReturnType<typeof vi.fn>;
  };
  return { notionImport, oauth };
}

describe('NotionSourceDriver.runImport', () => {
  let svc: NotionSourceDriver;
  let notionImport: NotionImportService & { importDatabase: ReturnType<typeof vi.fn> };
  let oauth: NotionOAuthService & {
    getStoredTokens: ReturnType<typeof vi.fn>;
    updateLastEditedTime: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    const mocks = buildMocks();
    notionImport = mocks.notionImport;
    oauth = mocks.oauth;
    svc = new NotionSourceDriver(notionImport, oauth);
  });

  it('rejects tasks missing identifiers', async () => {
    await expect(
      svc.runImport({
        task: { id: 'x', spaceId: null, tableId: 'tbl', remoteId: 'db' },
        isCanceled: () => false,
      })
    ).rejects.toThrow(/spaceId/);
  });

  it('rejects when no Notion token is stored for the space', async () => {
    oauth.getStoredTokens.mockResolvedValueOnce(null);
    await expect(
      svc.runImport({
        task: { id: 'x', spaceId: 'spY', tableId: 'tbl', remoteId: 'db' },
        isCanceled: () => false,
      })
    ).rejects.toThrow(/no notion token/i);
    expect(notionImport.importDatabase).not.toHaveBeenCalled();
  });

  it('delegates to NotionImportService.importDatabase and forwards callbacks', async () => {
    const progressLog: Array<unknown> = [];
    let canceled = false;
    const out = await svc.runImport({
      task: { id: 'sit_1', spaceId: 'spX', tableId: 'tbl', remoteId: 'db' },
      isCanceled: () => canceled,
      onProgress: async (counts) => {
        progressLog.push(counts);
      },
    });
    expect(notionImport.importDatabase).toHaveBeenCalledTimes(1);
    const args = notionImport.importDatabase.mock.calls[0][0] as Record<string, unknown>;
    expect(args['spaceId']).toBe('spX');
    expect(args['tableId']).toBe('tbl');
    expect(args['databaseId']).toBe('db');
    expect(typeof args['isCanceled']).toBe('function');
    expect(typeof args['onProgress']).toBe('function');
    expect(out).toEqual({
      processedCount: 42,
      failedCount: 3,
      totalCount: 45,
      result: { imported: 42, skipped: 3 },
    });
  });

  it('throws INotionImportCanceledError and wraps it via the driver', async () => {
    notionImport.importDatabase.mockImplementationOnce(async () => {
      throw new INotionImportCanceledError();
    });
    await expect(
      svc.runImport({
        task: { id: 'sit_2', spaceId: 'spX', tableId: 'tbl', remoteId: 'db' },
        isCanceled: () => true,
      })
    ).rejects.toBeInstanceOf(INotionImportCanceledError);
  });
});
