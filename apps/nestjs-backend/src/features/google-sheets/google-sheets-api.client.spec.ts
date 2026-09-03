/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import {
  GOOGLE_SHEETS_API,
  GoogleSheetsApiError,
  googleSheetsValuesGet,
} from './google-sheets-api.client';

describe('googleSheetsValuesGet (Phase 4.3)', () => {
  const baseInput = {
    spreadsheetId: 'sheet_1',
    range: 'A1:B2',
    accessToken: 'tok',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed values on a 200 response', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ range: 'A1:B2', majorDimension: 'ROWS', values: [['h1', 'h2'], ['v1', 'v2']] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const out = await googleSheetsValuesGet(baseInput);
    expect(out).toEqual({ range: 'A1:B2', majorDimension: 'ROWS', values: [['h1', 'h2'], ['v1', 'v2']] });
    const calls = fetchMock.mock.calls as unknown as Array<[unknown]>;
    const called = String(calls[0]?.[0] ?? '');
    expect(called).toBe(`${GOOGLE_SHEETS_API}/sheet_1/values/A1%3AB2`);
  });

  it('passes the bearer token in the Authorization header', async () => {
    const fetchMock = vi.fn(async () =>
      new Response('{"range":"A1:B2","values":[]}', { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    await googleSheetsValuesGet(baseInput);
    const initCalls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit?]>;
    const init = (initCalls[0]?.[1] ?? {}) as RequestInit;
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('throws a retryable 401 with code SHEETS_UNAUTHORIZED', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { status: 'UNAUTHENTICATED', message: 'expired' } }), {
          status: 401,
        })
      )
    );
    await expect(googleSheetsValuesGet(baseInput)).rejects.toMatchObject({
      name: 'GoogleSheetsApiError',
      code: 'SHEETS_UNAUTHORIZED',
      status: 401,
      retryable: true,
    });
  });

  it('throws a non-retryable 403 with code SHEETS_FORBIDDEN', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'no access' } }), {
          status: 403,
        })
      )
    );
    await expect(googleSheetsValuesGet(baseInput)).rejects.toBeInstanceOf(GoogleSheetsApiError);
    try {
      await googleSheetsValuesGet(baseInput);
    } catch (err) {
      expect((err as GoogleSheetsApiError).retryable).toBe(false);
      expect((err as GoogleSheetsApiError).code).toBe('SHEETS_FORBIDDEN');
    }
  });

  it('throws a non-retryable 404 with code SHEETS_NOT_FOUND', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { status: 'NOT_FOUND', message: 'missing' } }), {
          status: 404,
        })
      )
    );
    await expect(googleSheetsValuesGet(baseInput)).rejects.toMatchObject({
      code: 'SHEETS_NOT_FOUND',
      retryable: false,
    });
  });

  it('throws a retryable 429 with code SHEETS_TRANSIENT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { status: 'RESOURCE_EXHAUSTED', message: 'slow down' } }), {
          status: 429,
        })
      )
    );
    await expect(googleSheetsValuesGet(baseInput)).rejects.toMatchObject({
      code: 'SHEETS_TRANSIENT',
      retryable: true,
    });
  });

  it('throws a retryable 500 with code SHEETS_TRANSIENT', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { status: 'INTERNAL', message: 'boom' } }), {
          status: 500,
        })
      )
    );
    await expect(googleSheetsValuesGet(baseInput)).rejects.toMatchObject({
      code: 'SHEETS_TRANSIENT',
      retryable: true,
    });
  });

  it('throws SHEETS_INVALID_JSON when the body is not parseable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>oops</html>', { status: 200 }))
    );
    await expect(googleSheetsValuesGet(baseInput)).rejects.toMatchObject({
      code: 'SHEETS_INVALID_JSON',
      retryable: false,
    });
  });

  it('rejects empty inputs up-front', async () => {
    await expect(googleSheetsValuesGet({ ...baseInput, spreadsheetId: '' })).rejects.toThrow(
      /spreadsheetId/
    );
    await expect(googleSheetsValuesGet({ ...baseInput, range: '' })).rejects.toThrow(/range/);
    await expect(googleSheetsValuesGet({ ...baseInput, accessToken: '' })).rejects.toThrow(
      /accessToken/
    );
  });
});
