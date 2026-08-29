/* eslint-disable @typescript-eslint/naming-convention */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleSheetsOAuthService } from './google-sheets-oauth.service';

const response = (body: unknown, ok = true, status = 200): Response =>
  ({ ok, status, json: async () => body, text: async () => '' }) as unknown as Response;

const buildSetting = () => {
  const values: Record<string, unknown> = {};
  return {
    values,
    getSetting: vi.fn(async () => values),
    updateSetting: vi.fn(async (next: Record<string, unknown>) => {
      Object.assign(values, next);
      return values;
    }),
  };
};

describe('GoogleSheetsOAuthService (T-15 Wave 10)', () => {
  const originalFetch = globalThis.fetch;
  const originalClientId = process.env.GOOGLE_SHEETS_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_SHEETS_CLIENT_SECRET;

  beforeEach(() => {
    process.env.GOOGLE_SHEETS_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_SHEETS_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalClientId === undefined) {
      delete process.env.GOOGLE_SHEETS_CLIENT_ID;
    } else {
      process.env.GOOGLE_SHEETS_CLIENT_ID = originalClientId;
    }
    if (originalClientSecret === undefined) {
      delete process.env.GOOGLE_SHEETS_CLIENT_SECRET;
    } else {
      process.env.GOOGLE_SHEETS_CLIENT_SECRET = originalClientSecret;
    }
    vi.restoreAllMocks();
  });

  it('builds an authorize URL with offline + spreadsheets scopes', () => {
    const setting = buildSetting();
    const svc = new GoogleSheetsOAuthService(setting as never);
    const url = svc.getAuthorizeUrl('csrf-state');
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('client_id')).toBe('test-client-id');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/spreadsheets');
    expect(u.searchParams.get('state')).toBe('csrf-state');
  });

  it('exchangeCode posts to the Google token endpoint and parses the response', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response({
        access_token: 'ya29.abc',
        refresh_token: 'rt-secret',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        token_type: 'Bearer',
      }));
    globalThis.fetch = fetchMock;
    const setting = buildSetting();
    const svc = new GoogleSheetsOAuthService(setting as never);

    const tokens = await svc.exchangeCode('auth-code');
    expect(tokens.accessToken).toBe('ya29.abc');
    expect(tokens.refreshToken).toBe('rt-secret');
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresAt).toBeGreaterThan(Date.now());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0]!;
    expect(calledUrl).toBe('https://oauth2.googleapis.com/token');
    expect(init?.method).toBe('POST');
    const body = init?.body as URLSearchParams;
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_id')).toBe('test-client-id');
    expect(body.get('client_secret')).toBe('test-client-secret');
  });

  it('exchangeCode throws when the Google API returns an error', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () => response({}, false, 400));
    const setting = buildSetting();
    const svc = new GoogleSheetsOAuthService(setting as never);
    await expect(svc.exchangeCode('bad')).rejects.toThrow(/400/);
  });

  it('refreshAccessToken posts with grant_type=refresh_token', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response({
        access_token: 'ya29.refreshed',
        expires_in: 3600,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        token_type: 'Bearer',
      }));
    globalThis.fetch = fetchMock;
    const setting = buildSetting();
    const svc = new GoogleSheetsOAuthService(setting as never);
    const r = await svc.refreshAccessToken('rt-secret');
    expect(r.accessToken).toBe('ya29.refreshed');
    expect(r.expiresAt).toBeGreaterThan(Date.now());
    const [, init] = fetchMock.mock.calls[0]!;
    const body = init?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('rt-secret');
  });

  it('storeTokens encrypts the payload and persists under googleSheets.<spaceId>', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () => response({}));
    const setting = buildSetting();
    const svc = new GoogleSheetsOAuthService(setting as never);
    await svc.storeTokens(
      'spc123',
      {
        accessToken: 'ya29.tok',
        refreshToken: 'rt-1',
        expiresAt: Date.now() + 60_000,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        tokenType: 'Bearer',
      },
      { spreadsheetId: 'ss-1', sheetName: 'Sheet1' }
    );
    expect(setting.updateSetting).toHaveBeenCalledTimes(1);
    const arg = setting.updateSetting.mock.calls[0]![0];
    expect(Object.keys(arg)).toEqual(['googleSheets.spc123']);
    expect(arg['googleSheets.spc123']).toMatchObject({
      refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      spreadsheetId: 'ss-1',
      sheetName: 'Sheet1',
    });
    expect((arg['googleSheets.spc123'] as { cipher?: unknown }).cipher).toEqual(expect.any(String));
  });

  it('getStoredTokens decrypts the persisted payload', async () => {
    globalThis.fetch = vi.fn<typeof fetch>(async () => response({}));
    const setting = buildSetting();
    const svc = new GoogleSheetsOAuthService(setting as never);
    const expiresAt = Date.now() + 600_000;
    await svc.storeTokens('spc-decrypt', {
      accessToken: 'ya29.decrypt',
      refreshToken: 'rt-2',
      expiresAt,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      tokenType: 'Bearer',
    });
    const stored = await svc.getStoredTokens('spc-decrypt');
    expect(stored).toMatchObject({
      accessToken: 'ya29.decrypt',
      refreshToken: 'rt-2',
      expiresAt,
    });
  });

  it('hasCredentials toggles on env presence', () => {
    delete process.env.GOOGLE_SHEETS_CLIENT_ID;
    delete process.env.GOOGLE_SHEETS_CLIENT_SECRET;
    const svcMissing = new GoogleSheetsOAuthService(buildSetting() as never);
    expect(svcMissing.hasCredentials()).toBe(false);
    expect(() => svcMissing.getAuthorizeUrl('x')).toThrow();

    process.env.GOOGLE_SHEETS_CLIENT_ID = 'id';
    process.env.GOOGLE_SHEETS_CLIENT_SECRET = 'secret';
    const svcPresent = new GoogleSheetsOAuthService(buildSetting() as never);
    expect(svcPresent.hasCredentials()).toBe(true);
    expect(() => svcPresent.getAuthorizeUrl('x')).not.toThrow();
  });
});
