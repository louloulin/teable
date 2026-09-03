/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import {
  GoogleSheetsApiError,
  type IGoogleSheetsValuesGetResponse,
} from './google-sheets-api.client';
import { GoogleSheetsImportService } from './google-sheets-import.service';

interface IMockOAuth {
  getValidAccessToken: ReturnType<typeof vi.fn>;
}
interface IMockRecords {
  createRecords: ReturnType<typeof vi.fn>;
}
interface IMockApi {
  valuesGet: ReturnType<typeof vi.fn>;
}

const buildOAuth = (): IMockOAuth => ({
  getValidAccessToken: vi.fn(async () => ({ accessToken: 'tok', refreshToken: 'rt' })),
});

const buildRecords = (): IMockRecords => ({
  createRecords: vi.fn(async () => ({ records: [], id: 'x' })),
});

const buildApi = (overrides: Partial<{ valuesGet: ReturnType<typeof vi.fn> }> = {}): IMockApi => ({
  valuesGet: overrides.valuesGet ?? vi.fn(),
});

const sheetsResponse = (values: string[][]): IGoogleSheetsValuesGetResponse => ({
  range: 'A1:Z1000',
  majorDimension: 'ROWS',
  values,
});

describe('GoogleSheetsImportService (Phase 4.3)', () => {
  let oauth: IMockOAuth;
  let records: IMockRecords;
  let api: IMockApi;
  let svc: GoogleSheetsImportService;

  beforeEach(() => {
    oauth = buildOAuth();
    records = buildRecords();
    api = buildApi();
    // Build the service directly; we test the helper by calling
    // importSheet, which internally uses googleSheetsValuesGet. The
    // spy bypasses fetch by re-exporting a wrapper. We achieve this by
    // stubbing `fetch` via vi.stubGlobal, mirroring the API client spec.
    svc = new GoogleSheetsImportService(oauth as never, records as never);
  });

  const stubFetch = (response: Response) => {
    vi.stubGlobal('fetch', vi.fn(async () => response));
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns zero counts when the sheet has no data rows', async () => {
    stubFetch(new Response(JSON.stringify(sheetsResponse([['col_a', 'col_b']])), { status: 200 }));
    const out = await svc.importSheet({
      spaceId: 'sp_1',
      tableId: 'tbl_1',
      spreadsheetId: 'sheet_1',
    });
    expect(out).toEqual({ imported: 0, skipped: 0, total: 0, range: 'A1:Z1000' });
    expect(records.createRecords).not.toHaveBeenCalled();
  });

  it('maps header + rows to records and writes them in one batch', async () => {
    stubFetch(
      new Response(
        JSON.stringify(
          sheetsResponse([
            ['name', 'count'],
            ['alpha', '1'],
            ['beta', '2'],
          ])
        ),
        { status: 200 }
      )
    );
    const out = await svc.importSheet({
      spaceId: 'sp_1',
      tableId: 'tbl_1',
      spreadsheetId: 'sheet_1',
    });
    expect(out.imported).toBe(2);
    expect(out.skipped).toBe(0);
    expect(out.total).toBe(2);
    expect(records.createRecords).toHaveBeenCalledTimes(1);
    const calls = records.createRecords.mock.calls as unknown as unknown[][];
    const arg = calls[0] as [string, { records: Array<{ fields: Record<string, unknown> }>; fieldKeyType: string }];
    expect(arg[0]).toBe('tbl_1');
    expect(arg[1].records).toHaveLength(2);
    expect(arg[1].records[0].fields).toMatchObject({ name: 'alpha', count: '1', _source_row: 2 });
    expect(arg[1].records[1].fields).toMatchObject({ name: 'beta', count: '2', _source_row: 3 });
    expect(arg[1].fieldKeyType).toBe('name');
  });

  it('skips empty rows without writing them', async () => {
    stubFetch(
      new Response(
        JSON.stringify(
          sheetsResponse([
            ['a', 'b'],
            ['x', '1'],
            ['', ''],
            ['y', '2'],
          ])
        ),
        { status: 200 }
      )
    );
    const out = await svc.importSheet({
      spaceId: 'sp_1',
      tableId: 'tbl_1',
      spreadsheetId: 'sheet_1',
    });
    expect(out.imported).toBe(2);
    expect(out.skipped).toBe(1);
    expect(out.total).toBe(3);
  });

  it('batches writes at 100 records', async () => {
    const rows: string[][] = [['h']];
    for (let i = 0; i < 250; i += 1) rows.push([`r${i}`]);
    stubFetch(new Response(JSON.stringify(sheetsResponse(rows)), { status: 200 }));
    const out = await svc.importSheet({
      spaceId: 'sp_1',
      tableId: 'tbl_1',
      spreadsheetId: 'sheet_1',
    });
    expect(out.imported).toBe(250);
    expect(records.createRecords).toHaveBeenCalledTimes(3);
    expect(records.createRecords.mock.calls[0][1].records).toHaveLength(100);
    expect(records.createRecords.mock.calls[1][1].records).toHaveLength(100);
    expect(records.createRecords.mock.calls[2][1].records).toHaveLength(50);
  });

  it('reports progress after each batch', async () => {
    const rows: string[][] = [['h']];
    for (let i = 0; i < 250; i += 1) rows.push([`r${i}`]);
    stubFetch(new Response(JSON.stringify(sheetsResponse(rows)), { status: 200 }));
    const onProgress = vi.fn(async () => undefined);
    await svc.importSheet({
      spaceId: 'sp_1',
      tableId: 'tbl_1',
      spreadsheetId: 'sheet_1',
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledTimes(3);
    const progressCalls = onProgress.mock.calls as unknown as unknown[][];
    expect(progressCalls[0]?.[0]).toMatchObject({ imported: 100, skipped: 0, total: 250 });
  });

  it('honors isCanceled between batches', async () => {
    const rows: string[][] = [['h']];
    for (let i = 0; i < 250; i += 1) rows.push([`r${i}`]);
    stubFetch(new Response(JSON.stringify(sheetsResponse(rows)), { status: 200 }));
    let calls = 0;
    const out = await svc.importSheet({
      spaceId: 'sp_1',
      tableId: 'tbl_1',
      spreadsheetId: 'sheet_1',
      isCanceled: () => {
        calls += 1;
        return calls > 1; // cancel after the first batch starts
      },
    });
    expect(out.imported).toBeLessThanOrEqual(100);
    expect(records.createRecords.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('throws a domain error when Sheets API rejects (retryable)', async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { status: 'UNAUTHENTICATED', message: 'expired' } }), {
        status: 401,
      })
    );
    await expect(
      svc.importSheet({ spaceId: 'sp_1', tableId: 'tbl_1', spreadsheetId: 'sheet_1' })
    ).rejects.toThrow('SHEETS_UNAUTHORIZED');
  });

  it('returns null token when no token is stored (does not call Sheets API)', async () => {
    oauth.getValidAccessToken.mockResolvedValueOnce(null);
    await expect(
      svc.importSheet({ spaceId: 'sp_1', tableId: 'tbl_1', spreadsheetId: 'sheet_1' })
    ).rejects.toThrow(/no Google Sheets token stored/);
  });

  it('rejects empty inputs', async () => {
    await expect(svc.importSheet({ spaceId: '', tableId: 'tbl_1', spreadsheetId: 'sheet_1' })).rejects.toThrow();
    await expect(svc.importSheet({ spaceId: 'sp_1', tableId: '', spreadsheetId: 'sheet_1' })).rejects.toThrow();
    await expect(svc.importSheet({ spaceId: 'sp_1', tableId: 'tbl_1', spreadsheetId: '' })).rejects.toThrow();
  });

  it('uses the supplied range override when provided', async () => {
    stubFetch(new Response(JSON.stringify(sheetsResponse([['a'], ['x']])), { status: 200 }));
    const out = await svc.importSheet({
      spaceId: 'sp_1',
      tableId: 'tbl_1',
      spreadsheetId: 'sheet_1',
      range: 'B2:C10',
    });
    expect(out.range).toBe('B2:C10');
  });

  it('passes a custom normalizeHeader to map header names', async () => {
    const responseBody = sheetsResponse([['Name', ' Count '], ['alpha', '1']]);
    stubFetch(new Response(JSON.stringify(responseBody), { status: 200 }));
    const normalize = function (raw: string): string {
      return raw.toLowerCase().replace(/\s+/g, '_');
    };
    await svc.importSheet({
      spaceId: 'sp_1',
      tableId: 'tbl_1',
      spreadsheetId: 'sheet_1',
      normalizeHeader: normalize,
    });
    const fields = records.createRecords.mock.calls[0][1].records[0].fields as Record<string, string>;
    expect(fields).toMatchObject({ name: 'alpha', _count_: '1' });
  });
});
