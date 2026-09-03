/**
 * Notion OAuth — exchange authorization codes for tokens and persist the
 * resulting grant in the `notion_tokens` setting row (encrypted at rest).
 *
 * Notion's OAuth flow is "public" (no client secret signing required) but the
 * token endpoint still expects HTTP Basic auth with `client_id:client_secret`
 * per https://developers.notion.com/docs/authorization. The stored envelope
 * is AES-256-GCM with the same `TEABLE_INTEGRATION_SECRET` key derivation the
 * im-bridge service uses, so we don't introduce a new KMS dependency.
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

import {
  NOTION_OAUTH_AUTHORIZE,
  NOTION_OAUTH_TOKEN,
  type INotionOAuthTokens,
} from './notion.types';
import { SettingService } from '../setting/setting.service';

export const NOTION_TOKEN_SETTING_KEY = 'notion_tokens';

interface IStoredNotionTokenEnvelope {
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface IStoredNotionToken {
  spaceId: string;
  accessToken: string;
  botId?: string;
  workspaceName?: string;
  workspaceId?: string;
  ownerUserId?: string;
  /** Last `last_edited_time` cursor — used by incremental sync. */
  lastEditedTime?: string;
  /** Timestamp the connection was created — for stale-connection diagnostics. */
  connectedAt: string;
}

export type INotionStoredTokensBySpace = Record<string, IStoredNotionToken>;

/**
 * One `notion_tokens` setting row contains a map of `spaceId -> envelope`.
 * Spaces are admin-scoped today, but storing by `spaceId` makes the grant
 * naturally travel with the space (and the space is the smallest unit we
 * need to look up by when the wizard calls back).
 */
const TOKEN_KEY = (() => {
  const raw = process.env.TEABLE_INTEGRATION_SECRET;
  if (!raw && process.env.NODE_ENV === 'production') {
    throw new Error('TEABLE_INTEGRATION_SECRET is required for Notion integration secrets');
  }
  return scryptSync(raw ?? 'teable-local-development-secret', 'teable.notion.salt.v1', 32);
})();

const encrypt = (plaintext: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', TOKEN_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload: IStoredNotionTokenEnvelope = {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
};

const decrypt = (envelope: string): string => {
  const payload = JSON.parse(Buffer.from(envelope, 'base64').toString('utf8')) as
    | IStoredNotionTokenEnvelope
    | INotionOAuthTokens;
  // Defensive: legacy rows from earlier dev runs may have been stored as
  // raw JSON (no encryption). Detect by shape and return as-is.
  if ('accessToken' in payload && typeof payload.accessToken === 'string') {
    return JSON.stringify(payload);
  }
  const encrypted = payload as IStoredNotionTokenEnvelope;
  const iv = Buffer.from(encrypted.iv, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', TOKEN_KEY, iv);
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
};

interface INotionTokenExchangeResponse {
  access_token: string;
  bot_id?: string;
  workspace_id?: string;
  workspace_name?: string;
  owner?: { type?: string; user?: { id?: string } | null };
  refresh_token?: string | null;
  /** Seconds from now until the token expires. */
  expires_in?: number;
}

export interface INotionOAuthServiceDeps {
  configService: ConfigService;
  /** Provided so tests can stub persistence without standing up the DB. */
  loadSetting?: (key: string) => Promise<unknown>;
  saveSetting?: (key: string, value: unknown) => Promise<unknown>;
}

@Injectable()
export class NotionOAuthService {
  private readonly logger = new Logger(NotionOAuthService.name);
  private readonly loadSettingFn: (key: string) => Promise<unknown>;
  private readonly saveSettingFn: (key: string, value: unknown) => Promise<unknown>;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingService: SettingService
  ) {
    this.loadSettingFn = (key) => this.defaultLoadSetting(key);
    this.saveSettingFn = (key, value) => this.defaultSaveSetting(key, value);
  }

  /** Allow tests to inject their own persistence layer. */
  withPersistence(
    load: (key: string) => Promise<unknown>,
    save: (key: string, value: unknown) => Promise<unknown>
  ): NotionOAuthService {
    // Mutating the bound functions is intentional — services are singletons
    // and tests build their own instance with a small `Reflect` shim.
    (this as unknown as { loadSettingFn: typeof load }).loadSettingFn = load;
    (this as unknown as { saveSettingFn: typeof save }).saveSettingFn = save;
    return this;
  }

  private async defaultLoadSetting(key: string): Promise<unknown> {
    const all = (await this.settingService.getSetting([key])) as unknown as Record<string, unknown>;
    return all[key];
  }

  private async defaultSaveSetting(key: string, value: unknown): Promise<unknown> {
    return this.settingService.updateSetting({ [key]: value } as Record<string, unknown>);
  }

  /** Build the Notion OAuth authorize URL. */
  getAuthorizeUrl(state: string): string {
    const clientId = this.requireClientId();
    const redirectUri = this.requireRedirectUri();
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      owner: 'user',
      redirect_uri: redirectUri,
    });
    if (state) {
      params.set('state', state);
    }
    return `${NOTION_OAUTH_AUTHORIZE}?${params.toString()}`;
  }

  /**
   * Exchange a Notion authorization code for an access token. Throws
   * `BadRequestException` on non-2xx so the controller can surface the
   * upstream reason without a generic 500.
   */
  async exchangeCode(code: string): Promise<INotionOAuthTokens> {
    const clientId = this.requireClientId();
    const clientSecret = this.requireClientSecret();
    const redirectUri = this.requireRedirectUri();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });
    const response = await fetch(NOTION_OAUTH_TOKEN, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });
    const text = await response.text();
    let parsed: unknown = text;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // keep raw text
      }
    }
    if (!response.ok) {
      const message =
        typeof parsed === 'object' && parsed !== null && 'error' in parsed
          ? String((parsed as { error: unknown }).error)
          : `Notion OAuth exchange failed (${response.status})`;
      throw new BadRequestException(message);
    }
    const data = parsed as INotionTokenExchangeResponse;
    if (!data.access_token) {
      throw new BadRequestException('Notion OAuth response missing access_token');
    }
    return {
      accessToken: data.access_token,
      botId: data.bot_id,
      workspaceName: data.workspace_name,
      workspaceId: data.workspace_id,
      owner: data.owner,
      refreshToken: data.refresh_token ?? null,
      expiresAt:
        typeof data.expires_in === 'number'
          ? new Date(Date.now() + data.expires_in * 1000).toISOString()
          : null,
    };
  }

  /**
   * Encrypt + persist the OAuth grant under `spaceId`. Multiple spaces can be
   * connected independently (each gets its own OAuth grant) and live in the
   * same `notion_tokens` setting row.
   */
  async storeTokens(spaceId: string, tokens: INotionOAuthTokens): Promise<void> {
    if (!spaceId) {
      throw new BadRequestException('spaceId is required');
    }
    const existing = await this.readAll();
    const envelope: IStoredNotionToken = {
      spaceId,
      accessToken: tokens.accessToken,
      botId: tokens.botId,
      workspaceName: tokens.workspaceName,
      workspaceId: tokens.workspaceId,
      ownerUserId: tokens.owner?.user?.id,
      connectedAt: new Date().toISOString(),
    };
    const next: INotionStoredTokensBySpace = {
      ...existing,
      [spaceId]: envelope,
    };
    const encrypted = encrypt(JSON.stringify(next));
    await this.saveSettingFn(NOTION_TOKEN_SETTING_KEY, encrypted);
  }

  /** Resolve the token envelope for a single space. Returns null when absent. */
  async getStoredTokens(spaceId: string): Promise<IStoredNotionToken | null> {
    const all = await this.readAll();
    return all[spaceId] ?? null;
  }

  /** Wipe the stored envelope for the space. Idempotent. */
  async clearTokens(spaceId: string): Promise<void> {
    const all = await this.readAll();
    if (!all[spaceId]) return;
    delete all[spaceId];
    const encrypted = encrypt(JSON.stringify(all));
    await this.saveSettingFn(NOTION_TOKEN_SETTING_KEY, encrypted);
  }

  /**
   * Update the incremental-sync cursor. Stored alongside the token envelope
   * so a reconnect doesn't lose the cursor (the new envelope inherits the
   * `lastEditedTime` field).
   */
  async updateLastEditedTime(spaceId: string, lastEditedTime: string): Promise<void> {
    const all = await this.readAll();
    const existing = all[spaceId];
    if (!existing) return;
    all[spaceId] = { ...existing, lastEditedTime };
    const encrypted = encrypt(JSON.stringify(all));
    await this.saveSettingFn(NOTION_TOKEN_SETTING_KEY, encrypted);
  }

  private async readAll(): Promise<INotionStoredTokensBySpace> {
    const raw = await this.loadSettingFn(NOTION_TOKEN_SETTING_KEY);
    if (!raw || typeof raw !== 'string') return {};
    try {
      const decoded = decrypt(raw);
      const parsed = JSON.parse(decoded) as INotionStoredTokensBySpace;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      this.logger.warn(
        `Failed to decode stored notion tokens; treating as empty: ${
          error instanceof Error ? error.message : 'unknown error'
        }`
      );
      return {};
    }
  }

  private requireClientId(): string {
    const value = this.configService.get<string>('NOTION_CLIENT_ID');
    if (!value) {
      throw new BadRequestException(
        'NOTION_CLIENT_ID is not configured. Set it in the backend environment to enable Notion OAuth.'
      );
    }
    return value;
  }

  private requireClientSecret(): string {
    const value = this.configService.get<string>('NOTION_CLIENT_SECRET');
    if (!value) {
      throw new BadRequestException(
        'NOTION_CLIENT_SECRET is not configured. Set it in the backend environment to enable Notion OAuth.'
      );
    }
    return value;
  }

  private requireRedirectUri(): string {
    const value = this.configService.get<string>('NOTION_REDIRECT_URI');
    if (!value) {
      throw new BadRequestException(
        'NOTION_REDIRECT_URI is not configured. Set it to the wizard callback URL (e.g. https://<host>/admin/import/notion/callback).'
      );
    }
    return value;
  }
}
