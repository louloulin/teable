/**
 * Google Sheets OAuth — T-15 Wave 10.
 *
 * Pure Node-crypto + plain `fetch` (no googleapis dep). Reads
 * `GOOGLE_SHEETS_CLIENT_ID` / `GOOGLE_SHEETS_CLIENT_SECRET` from the
 * environment. Tokens are stored encrypted at rest in the `setting`
 * table via SettingService (one row per space, name
 * `googleSheets.<spaceId>`). The encryption uses AES-256-GCM with a
 * key derived from `PRISMA_FIELD_ENCRYPTION_KEY` (falls back to a
 * deterministic per-deploy key when unset) — see `encryptSecret` /
 * `decryptSecret`.
 *
 * Wire format:
 *   - `getAuthorizeUrl` returns a Google authorization URL the front
 *     end can `window.open` (or follow via redirect). The `state`
 *     parameter is the caller's CSRF nonce; we don't validate it
 *     because the caller's callback handler owns state lifecycle.
 *   - `exchangeCode` exchanges the redirect-time `code` for
 *     access + refresh + expiry.
 *   - `refreshAccessToken` rotates access tokens from a stored
 *     refresh token.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ISettingVo } from '@teable/openapi';
import { SettingService } from '../setting/setting.service';

const GOOGLE_AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const GOOGLE_SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const ENCRYPTION_ALGO = 'aes-256-gcm';
const ENCRYPTION_SALT = 'teable.googleSheets.salt.v1';
const ENCRYPTION_KEYLEN = 32;
const ENCRYPTION_IV_LEN = 12;
const ENCRYPTION_TAG_LEN = 16;

const SETTING_KEY_PREFIX = 'googleSheets.';

export interface IGoogleSheetsTokens {
  accessToken: string;
  refreshToken: string | null;
  /** epoch millis when the access token expires */
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export interface IStoredGoogleSheetsTokens extends IGoogleSheetsTokens {
  /** When the row was last persisted (epoch millis) */
  storedAt: number;
  /** Spreadsheet ID last synced (or null when not yet bound) */
  spreadsheetId: string | null;
  sheetName: string | null;
}

export interface IGoogleSheetsOAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const readEnv = (): IGoogleSheetsOAuthEnv | null => {
  const clientId = process.env.GOOGLE_SHEETS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_SHEETS_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  const base = (process.env.PUBLIC_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
  return {
    clientId,
    clientSecret,
    redirectUri: `${base}/api/admin/google-sheets/oauth/callback`,
  };
};

const encryptionKey = (): Buffer => {
  // Fallback determinism: same secret material as the rest of the
  // app so the setting row is decryptable across restarts without
  // forcing operators to set yet another env var.
  const seed = process.env.PRISMA_FIELD_ENCRYPTION_KEY ?? 'teable.googleSheets.fallback.v1';
  return scryptSync(seed, ENCRYPTION_SALT, ENCRYPTION_KEYLEN);
};

const encryptSecret = (plaintext: string): string => {
  const iv = randomBytes(ENCRYPTION_IV_LEN);
  const cipher = createCipheriv(ENCRYPTION_ALGO, encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64url'),
    enc.toString('base64url'),
    tag.toString('base64url'),
  ].join('.');
};

const decryptSecret = (blob: string): string => {
  const parts = blob.split('.');
  if (parts.length !== 3) throw new Error('malformed encrypted token');
  const iv = Buffer.from(parts[0]!, 'base64url');
  const enc = Buffer.from(parts[1]!, 'base64url');
  const tag = Buffer.from(parts[2]!, 'base64url');
  const decipher = createDecipheriv(ENCRYPTION_ALGO, encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
};

const sha256Hex = (s: string): string => createHash('sha256').update(s).digest('hex');

export interface IGoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
}

@Injectable()
export class GoogleSheetsOAuthService {
  private readonly logger = new Logger(GoogleSheetsOAuthService.name);

  constructor(private readonly setting: SettingService) {}

  /**
   * Returns true when the operator has configured Google OAuth
   * client credentials. Used by the controller to fail fast with a
   * clear message rather than mid-OAuth.
   */
  hasCredentials(): boolean {
    return readEnv() !== null;
  }

  getAuthorizeUrl(state: string): string {
    const env = readEnv();
    if (!env) {
      throw new ServiceUnavailableException(
        'Google Sheets OAuth is not configured. Set GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET.'
      );
    }
    const u = new URL(GOOGLE_AUTHORIZE_ENDPOINT);
    u.searchParams.set('client_id', env.clientId);
    u.searchParams.set('redirect_uri', env.redirectUri);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('include_granted_scopes', 'true');
    u.searchParams.set('prompt', 'consent');
    u.searchParams.set('scope', GOOGLE_SHEETS_SCOPES.join(' '));
    u.searchParams.set('state', state);
    return u.toString();
  }

  async exchangeCode(code: string): Promise<IGoogleSheetsTokens> {
    const env = readEnv();
    if (!env) {
      throw new ServiceUnavailableException(
        'Google Sheets OAuth is not configured. Set GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET.'
      );
    }
    if (!code) {
      throw new BadRequestException('code required');
    }
    const body = new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: 'authorization_code',
    });
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const errText = await res.text();
      this.logger.error(`Google token exchange failed: ${res.status} ${errText}`);
      throw new BadRequestException(`Google token exchange failed: ${res.status}`);
    }
    const json = (await res.json()) as IGoogleTokenResponse;
    if (!json.access_token) {
      throw new BadRequestException('Google response missing access_token');
    }
    return this.toTokens(json);
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    expiresAt: number;
  }> {
    const env = readEnv();
    if (!env) {
      throw new ServiceUnavailableException(
        'Google Sheets OAuth is not configured. Set GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET.'
      );
    }
    if (!refreshToken) {
      throw new BadRequestException('refreshToken required');
    }
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: 'refresh_token',
    });
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const errText = await res.text();
      this.logger.error(`Google token refresh failed: ${res.status} ${errText}`);
      throw new BadRequestException(`Google token refresh failed: ${res.status}`);
    }
    const json = (await res.json()) as IGoogleTokenResponse;
    if (!json.access_token) {
      throw new BadRequestException('Google refresh response missing access_token');
    }
    return {
      accessToken: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000,
    };
  }

  async storeTokens(
    spaceId: string,
    tokens: IGoogleSheetsTokens,
    bind?: { spreadsheetId?: string; sheetName?: string }
  ): Promise<void> {
    const existing = await this.getStoredTokens(spaceId);
    const stored: IStoredGoogleSheetsTokens = {
      accessToken: tokens.accessToken,
      // Google only returns a refresh_token on the first exchange or
      // when the user re-consents; preserve the existing one.
      refreshToken: tokens.refreshToken ?? existing?.refreshToken ?? null,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      tokenType: tokens.tokenType,
      storedAt: Date.now(),
      spreadsheetId: bind?.spreadsheetId ?? existing?.spreadsheetId ?? null,
      sheetName: bind?.sheetName ?? existing?.sheetName ?? null,
    };
    const blob = encryptSecret(JSON.stringify(stored));
    // Cast to Partial<ISettingVo> — the SettingService API stores
    // arbitrary JSON content per key, and ISettingVo is intentionally
    // a strict whitelist of typed settings. We add a new key
    // (`googleSheets.<spaceId>`) at runtime, not via the type.
    await this.setting.updateSetting({
      [this.settingKey(spaceId)]: {
        cipher: blob,
        // Hash so a quick lookup tells the controller whether a
        // token is currently stored without decrypting.
        refreshTokenHash: stored.refreshToken ? sha256Hex(stored.refreshToken) : null,
        expiresAt: stored.expiresAt,
        spreadsheetId: stored.spreadsheetId,
        sheetName: stored.sheetName,
      },
    } as Partial<ISettingVo>);
  }

  async getStoredTokens(spaceId: string): Promise<IStoredGoogleSheetsTokens | null> {
    const settings = await this.setting.getSetting([this.settingKey(spaceId)]);
    // Cast to a row-shaped object because the runtime setting key
    // (`googleSheets.<spaceId>`) isn't part of the ISettingVo type.
    const row = settings[this.settingKey(spaceId)] as unknown as
      | { cipher?: string; spreadsheetId?: string | null; sheetName?: string | null }
      | null
      | undefined;
    if (!row || !row.cipher) return null;
    try {
      const decrypted = decryptSecret(row.cipher);
      return JSON.parse(decrypted) as IStoredGoogleSheetsTokens;
    } catch (err) {
      this.logger.warn(`failed to decrypt Google Sheets token for space ${spaceId}: ${err}`);
      return null;
    }
  }

  async clearTokens(spaceId: string): Promise<void> {
    // SettingService doesn't expose a `delete(name)` API; an empty
    // `null` content keeps the key but signals "no tokens" to the
    // status endpoint. We additionally write a tombstone so a
    // re-disconnect is auditable.
    await this.setting.updateSetting({
      [this.settingKey(spaceId)]: {
        cipher: null,
        refreshTokenHash: null,
        expiresAt: null,
        spreadsheetId: null,
        sheetName: null,
        clearedAt: Date.now(),
      },
    } as Partial<ISettingVo>);
  }

  /**
   * Returns a fresh access token, refreshing if within 60s of
   * expiry. Throws when no tokens are stored or refresh fails.
   */
  async getValidAccessToken(spaceId: string): Promise<{ accessToken: string; refreshToken: string | null }> {
    const stored = await this.getStoredTokens(spaceId);
    if (!stored) {
      throw new ServiceUnavailableException(
        `Google Sheets is not connected for space ${spaceId}.`
      );
    }
    if (stored.expiresAt - 60_000 > Date.now()) {
      return { accessToken: stored.accessToken, refreshToken: stored.refreshToken };
    }
    if (!stored.refreshToken) {
      throw new ServiceUnavailableException(
        'Google Sheets access token expired and no refresh_token is stored. Reconnect.'
      );
    }
    const refreshed = await this.refreshAccessToken(stored.refreshToken);
    const updated: IGoogleSheetsTokens = {
      accessToken: refreshed.accessToken,
      refreshToken: stored.refreshToken,
      expiresAt: refreshed.expiresAt,
      scope: stored.scope,
      tokenType: 'Bearer',
    };
    await this.storeTokens(spaceId, updated);
    return { accessToken: refreshed.accessToken, refreshToken: stored.refreshToken };
  }

  private settingKey(spaceId: string): string {
    return `${SETTING_KEY_PREFIX}${spaceId}`;
  }

  private toTokens(json: IGoogleTokenResponse): IGoogleSheetsTokens {
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? null,
      expiresAt: Date.now() + json.expires_in * 1000,
      scope: json.scope ?? GOOGLE_SHEETS_SCOPES.join(' '),
      tokenType: json.token_type ?? 'Bearer',
    };
  }
}
