import { BadRequestException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IClsStore } from '../../types/cls';
import { NotionImportService } from './notion-import.service';
import type { NotionOAuthService } from './notion-oauth.service';
import type { RecordOpenApiV2Service } from '../record/open-api/record-open-api-v2.service';

/**
 * Unit tests for `NotionImportService`.
 *
 * Strategy: stub the three Nest dependencies (`oauthService`,
 * `recordOpenApiV2Service`, `cls`) and replace the global `fetch` with a
 * minimal handler that returns canned Notion payloads. The handler routes
 * on `/search`, `/databases/{id}`, and `/databases/{id}/query`.
 */

interface INotionFetchCall {
  url: string;
  init?: RequestInit;
}

const mockFetch = vi.fn();
const originalFetch = global.fetch;

interface IStoredToken {
  spaceId: string;
  accessToken: string;
  lastEditedTime?: string;
  workspaceName?: string;
}

const buildServices = (storedTokens: Record<string, IStoredToken>) => {
  const oauthService = {
    getStoredTokens: vi.fn(async (spaceId: string) => storedTokens[spaceId] ?? null),
    updateLastEditedTime: vi.fn(async (_spaceId: string, _lastEditedTime: string) => undefined),
  } as unknown as NotionOAuthService & {
    getStoredTokens: ReturnType<typeof vi.fn>;
    updateLastEditedTime: ReturnType<typeof vi.fn>;
  };

  const recordOpenApiV2Service = {
    createRecords: vi.fn(async () => ({ data: { records: [] } })),
  } as unknown as RecordOpenApiV2Service & {
    createRecords: ReturnType<typeof vi.fn>;
  };

  const cls = {
    set: vi.fn(),
  } as unknown as import('nestjs-cls').ClsService<IClsStore> & {
    set: ReturnType<typeof vi.fn>;
  };

  return { oauthService, recordOpenApiV2Service, cls };
};

const respondJson = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
    json: async () => body,
  }) as unknown as Response;

const setupFetchRoutes = (routes: Record<string, unknown>) => {
  const calls: INotionFetchCall[] = [];
  mockFetch.mockImplementation(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    for (const [path, body] of Object.entries(routes)) {
      if (url.endsWith(path)) {
        return respondJson(body);
      }
    }
    throw new Error(`Unhandled Notion fetch in test: ${url}`);
  });
  return calls;
};

describe('NotionImportService.listDatabases', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls /search with the database filter and normalises the response', async () => {
    const { oauthService, recordOpenApiV2Service, cls } = buildServices({
      spc1: { spaceId: 'spc1', accessToken: 'tok' },
    });
    setupFetchRoutes({
      '/search': {
        results: [
          {
            id: 'db_a',
            object: 'database',
            title: [{ plainText: 'Tasks', href: null }],
            properties: { Name: { id: 'p', type: 'title' } },
          },
          {
            id: 'db_b',
            object: 'database',
            title: [],
            properties: {},
          },
        ],
      },
    });
    const svc = new NotionImportService(oauthService, recordOpenApiV2Service, cls);
    const items = await svc.listDatabases('spc1');
    expect(items).toEqual([
      {
        id: 'db_a',
        title: 'Tasks',
        properties: { Name: { id: 'p', type: 'title' } },
      },
      {
        id: 'db_b',
        title: '',
        properties: {},
      },
    ]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ filter: { value: 'database', property: 'object' } });
  });

  it('throws BadRequestException when no token is stored for the space', async () => {
    const { oauthService, recordOpenApiV2Service, cls } = buildServices({});
    const svc = new NotionImportService(oauthService, recordOpenApiV2Service, cls);
    await expect(svc.listDatabases('spc_missing')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('NotionImportService.fetchDatabaseSchema', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps the Notion database schema to Teable field RO list and primary index', async () => {
    const { oauthService, recordOpenApiV2Service, cls } = buildServices({
      spc1: { spaceId: 'spc1', accessToken: 'tok' },
    });
    setupFetchRoutes({
      '/databases/db_a': {
        id: 'db_a',
        title: [{ plainText: 'Tasks', href: null }],
        properties: {
          Name: { id: 'p1', type: 'title' },
          Notes: { id: 'p2', type: 'rich_text' },
          FormulaCol: { id: 'p3', type: 'formula' },
        },
      },
    });
    const svc = new NotionImportService(oauthService, recordOpenApiV2Service, cls);
    const mapping = await svc.fetchDatabaseSchema('spc1', 'db_a');
    expect(mapping.fields.map((f) => f.sourceName)).toEqual(['Name', 'Notes', 'FormulaCol']);
    expect(mapping.primaryIndex).toBe(0);
    expect(mapping.skipped.map((s) => s.sourceName)).toEqual(['FormulaCol']);
  });
});

describe('NotionImportService.importDatabase', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('imports all pages, calls createRecords, and reports imported+skipped counts', async () => {
    const { oauthService, recordOpenApiV2Service, cls } = buildServices({
      spc1: { spaceId: 'spc1', accessToken: 'tok' },
    });
    setupFetchRoutes({
      '/databases/db_a': {
        id: 'db_a',
        title: [],
        properties: {
          Name: { id: 'p1', type: 'title' },
        },
      },
      '/databases/db_a/query': {
        results: [
          {
            id: 'page_1',
            last_edited_time: '2024-01-15T00:00:00.000Z',
            properties: {
              Name: { id: 'p1', type: 'title', title: [{ plainText: 'First', href: null }] },
            },
          },
          {
            id: 'page_2',
            last_edited_time: '2024-01-20T00:00:00.000Z',
            properties: {
              Name: { id: 'p1', type: 'title', title: [{ plainText: 'Second', href: null }] },
            },
          },
        ],
        has_more: false,
        next_cursor: null,
      },
    });

    const svc = new NotionImportService(oauthService, recordOpenApiV2Service, cls);
    const result = await svc.importDatabase({
      spaceId: 'spc1',
      tableId: 'tbl_target',
      databaseId: 'db_a',
    });

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.lastEditedTime).toBe('2024-01-20T00:00:00.000Z');
    expect(recordOpenApiV2Service.createRecords).toHaveBeenCalledTimes(1);
    expect(cls.set).toHaveBeenCalledWith(
      'notionImportResult',
      expect.objectContaining({ imported: 2 })
    );
  });

  it('incremental=true forwards the stored lastEditedTime to the query filter', async () => {
    const { oauthService, recordOpenApiV2Service, cls } = buildServices({
      spc1: {
        spaceId: 'spc1',
        accessToken: 'tok',
        lastEditedTime: '2024-01-15T00:00:00.000Z',
      },
    });
    const calls = setupFetchRoutes({
      '/databases/db_a': {
        id: 'db_a',
        title: [],
        properties: { Name: { id: 'p1', type: 'title' } },
      },
      '/databases/db_a/query': {
        results: [],
        has_more: false,
        next_cursor: null,
      },
    });

    const svc = new NotionImportService(oauthService, recordOpenApiV2Service, cls);
    await svc.importDatabase({
      spaceId: 'spc1',
      tableId: 'tbl_target',
      databaseId: 'db_a',
      incremental: true,
    });

    const queryCall = calls.find((call) => call.url.includes('/databases/db_a/query'));
    expect(queryCall).toBeDefined();
    const body = JSON.parse(String(queryCall?.init?.body));
    expect(body.filter).toEqual({
      lastEditedTime: { after: '2024-01-15T00:00:00.000Z' },
    });
  });

  it('rejects calls missing required identifiers', async () => {
    const { oauthService, recordOpenApiV2Service, cls } = buildServices({
      spc1: { spaceId: 'spc1', accessToken: 'tok' },
    });
    const svc = new NotionImportService(oauthService, recordOpenApiV2Service, cls);

    await expect(
      svc.importDatabase({ spaceId: '', tableId: 'tbl', databaseId: 'db' })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.importDatabase({ spaceId: 'spc1', tableId: '', databaseId: 'db' })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      svc.importDatabase({ spaceId: 'spc1', tableId: 'tbl', databaseId: '' })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('increments skipped when createRecords fails for the batch', async () => {
    const { oauthService, recordOpenApiV2Service, cls } = buildServices({
      spc1: { spaceId: 'spc1', accessToken: 'tok' },
    });
    setupFetchRoutes({
      '/databases/db_a': {
        id: 'db_a',
        title: [],
        properties: { Name: { id: 'p1', type: 'title' } },
      },
      '/databases/db_a/query': {
        results: [
          {
            id: 'page_1',
            last_edited_time: '2024-01-15T00:00:00.000Z',
            properties: {
              Name: { id: 'p1', type: 'title', title: [{ plainText: 'X', href: null }] },
            },
          },
        ],
        has_more: false,
        next_cursor: null,
      },
    });
    recordOpenApiV2Service.createRecords.mockRejectedValueOnce(new Error('boom'));
    const svc = new NotionImportService(oauthService, recordOpenApiV2Service, cls);
    const result = await svc.importDatabase({
      spaceId: 'spc1',
      tableId: 'tbl_target',
      databaseId: 'db_a',
    });
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
