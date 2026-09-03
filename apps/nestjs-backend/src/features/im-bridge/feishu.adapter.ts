/* SPDX-License-Identifier: AGPL-3.0-or-later */
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Feishu (Lark) bot adapter — open-platform tenant API (Stage  Stage  Stage V57).
 *
 * Implements the `IBridgeAdapter` contract using Feishu's Open Platform
 * APIs:
 *   - Tenant access token:  POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal
 *   - Send message:         POST https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=<type>
 *
 * Config blob shape:
 *   {
 *     appId:      string  // Feishu 自建应用 App ID (cli_xxx)
 *     appSecret:  string  // Feishu 自建应用 App Secret
 *     receiveId:  string  // chat_id / open_id / email / union_id
 *     receiveIdType: 'chat_id' | 'open_id' | 'email' | 'union_id'
 *   }
 *
 * Token caching: tenant_access_token has a 2h TTL, but the API caps
 * refresh rate; we cache the token + expireAt in-process for 90% of the
 * documented lifetime so refreshes happen at most every ~50 minutes.
 *
 * Wire references:
 *   https://open.feishu.cn/document/server-docs/im-v1/message/create
 *   https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal
 *
 * License: AGPL-3.0
 */
import { createHash, timingSafeEqual } from 'crypto';
import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import { safeFetch } from '../../utils/ssrf-http';
import type { IBridgeAdapter, IBridgeMessage } from './im-bridge.types';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
const TOKEN_TTL_FLOOR_MS = 60_000; // never reuse a token with <60s left

interface IFeishuConfig {
  appId: string;
  appSecret: string;
  receiveId: string;
  receiveIdType: 'chat_id' | 'open_id' | 'email' | 'union_id';
}

export type FeishuMessageKind = 'text' | 'image' | 'file' | 'post';
export type FeishuUploadKind = 'image' | 'file';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const FEISHU_EVENT_SIGNATURE_MAX_AGE_SECONDS = 5 * 60;

export const computeFeishuEventSignature = (
  timestamp: string,
  nonce: string,
  encryptKey: string,
  rawBody: string
): string =>
  createHash('sha256').update(`${timestamp}${nonce}${encryptKey}${rawBody}`).digest('hex');

export const verifyFeishuEventSignature = (input: {
  timestamp?: string;
  nonce?: string;
  signature?: string;
  encryptKey?: string;
  rawBody: string;
  nowSeconds?: number;
  maxAgeSeconds?: number;
}): { ok: true } | { ok: false; error: string } => {
  if (!input.encryptKey) return { ok: false, error: 'encryptKey is not configured' };
  if (!input.timestamp || !input.nonce || !input.signature) {
    return { ok: false, error: 'Feishu signature headers are required' };
  }
  const timestamp = Number(input.timestamp);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const maxAge = input.maxAgeSeconds ?? FEISHU_EVENT_SIGNATURE_MAX_AGE_SECONDS;
  if (!Number.isInteger(timestamp) || Math.abs(now - timestamp) > maxAge) {
    return { ok: false, error: 'Feishu signature timestamp is outside the allowed window' };
  }
  const expected = computeFeishuEventSignature(
    input.timestamp,
    input.nonce,
    input.encryptKey,
    input.rawBody
  );
  const actual = Buffer.from(input.signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
    return { ok: false, error: 'invalid Feishu event signature' };
  }
  return { ok: true };
};

interface ITokenCacheEntry {
  token: string;
  expireAt: number;
}

@Injectable()
export class FeishuAdapter implements IBridgeAdapter {
  readonly type = 'feishu';

  private readonly logger = new Logger(FeishuAdapter.name);
  private readonly tokenCache = new Map<string, ITokenCacheEntry>();

  constructor(private readonly http: HttpService) {}

  validateConfig(config: Record<string, unknown>): { ok: boolean; error?: string } {
    const { appId, appSecret, receiveId, receiveIdType } = config;
    if (typeof appId !== 'string' || appId.length === 0) {
      return { ok: false, error: 'appId is required' };
    }
    if (typeof appSecret !== 'string' || appSecret.length === 0) {
      return { ok: false, error: 'appSecret is required' };
    }
    if (typeof receiveId !== 'string' || receiveId.length === 0) {
      return { ok: false, error: 'receiveId is required' };
    }
    const validTypes = ['chat_id', 'open_id', 'email', 'union_id'];
    if (typeof receiveIdType !== 'string' || !validTypes.includes(receiveIdType)) {
      return {
        ok: false,
        error: `receiveIdType must be one of ${validTypes.join(', ')}`,
      };
    }
    return { ok: true };
  }

  async sendMessage(
    config: Record<string, unknown>,
    message: IBridgeMessage
  ): Promise<{ delivered: true; status: number } | { delivered: false; error: string }> {
    const cfg = config as unknown as IFeishuConfig;
    const validation = this.validateConfig(config);
    if (!validation.ok) {
      return { delivered: false, error: validation.error ?? 'invalid config' };
    }
    let token: string;
    try {
      token = await this.getTenantToken(cfg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`feishu token fetch failed: ${msg}`);
      return { delivered: false, error: `token error: ${msg}` };
    }
    const payload = this.buildMessagePayload(message);
    if (!payload.ok) return { delivered: false, error: payload.error };
    const body = {
      receive_id: cfg.receiveId,
      msg_type: payload.msgType,
      content: JSON.stringify(payload.content),
    };
    try {
      const resp = await firstValueFrom(
        this.http.post(
          `${FEISHU_API_BASE}/im/v1/messages?receive_id_type=${encodeURIComponent(cfg.receiveIdType)}`,
          body,
          { headers: { Authorization: `Bearer ${token}` } }
        )
      );
      const status = resp.status;
      const data = resp.data as { code?: number; msg?: string };
      if (status >= 200 && status < 300 && data.code === 0) {
        return { delivered: true, status };
      }
      return {
        delivered: false,
        error: `feishu send failed: status=${status} code=${data.code} msg=${data.msg}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`feishu send exception: ${msg}`);
      return { delivered: false, error: msg };
    }
  }

  async uploadFromUrl(
    config: Record<string, unknown>,
    input: {
      kind: FeishuUploadKind;
      sourceUrl: string;
      fileName?: string;
      contentType?: string;
    }
  ): Promise<
    | { uploaded: true; kind: FeishuUploadKind; key: string; contentType?: string }
    | { uploaded: false; error: string }
  > {
    const cfg = config as unknown as IFeishuConfig;
    const validation = this.validateConfig(config);
    if (!validation.ok) return { uploaded: false, error: validation.error ?? 'invalid config' };
    let token: string;
    try {
      token = await this.getTenantToken(cfg);
    } catch (error) {
      return {
        uploaded: false,
        error: `token error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    let response: Awaited<ReturnType<typeof safeFetch>>;
    try {
      response = await safeFetch(input.sourceUrl, { method: 'GET' });
    } catch (error) {
      return {
        uploaded: false,
        error: `source download failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (!response.ok) {
      return { uploaded: false, error: `source download returned HTTP ${response.status}` };
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_UPLOAD_BYTES) {
      return { uploaded: false, error: 'source file exceeds the 10 MiB upload limit' };
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_UPLOAD_BYTES) {
      return { uploaded: false, error: 'source file exceeds the 10 MiB upload limit' };
    }
    const contentType =
      input.contentType ?? response.headers.get('content-type') ?? 'application/octet-stream';
    const fileName = input.fileName ?? this.fileNameFromUrl(input.sourceUrl, input.kind);
    return this.uploadBytes(token, input.kind, bytes, fileName, contentType);
  }

  // ── helpers ───────────────────────────────────────────────────────

  /**
   * Fetch a tenant_access_token, caching for ~90% of the documented TTL.
   * Cache key is appId so multiple apps don't collide.
   */
  private async getTenantToken(cfg: IFeishuConfig): Promise<string> {
    const cached = this.tokenCache.get(cfg.appId);
    const now = Date.now();
    if (cached && cached.expireAt - now > TOKEN_TTL_FLOOR_MS) {
      return cached.token;
    }
    const resp = await firstValueFrom(
      this.http.post(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
        app_id: cfg.appId,
        app_secret: cfg.appSecret,
      })
    );
    const data = resp.data as {
      code?: number;
      msg?: string;
      tenant_access_token?: string;
      expire?: number;
    };
    if (data.code !== 0 || !data.tenant_access_token) {
      throw new Error(`tenant token rejected: code=${data.code} msg=${data.msg}`);
    }
    const ttlMs = (data.expire ?? 7200) * 1000;
    const expireAt = now + Math.floor(ttlMs * 0.9);
    this.tokenCache.set(cfg.appId, { token: data.tenant_access_token, expireAt });
    return data.tenant_access_token;
  }

  private async uploadBytes(
    token: string,
    kind: FeishuUploadKind,
    bytes: Buffer,
    fileName: string,
    contentType: string
  ): Promise<
    | { uploaded: true; kind: FeishuUploadKind; key: string; contentType?: string }
    | { uploaded: false; error: string }
  > {
    const form = new FormData();
    form.append(
      kind === 'image' ? 'image' : 'file',
      new Blob([bytes], { type: contentType }),
      fileName
    );
    if (kind === 'image') form.append('image_type', 'message');
    else form.append('file_type', 'stream');
    try {
      const response = await firstValueFrom(
        this.http.post(`${FEISHU_API_BASE}/im/v1/${kind === 'image' ? 'images' : 'files'}`, form, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      const data = response.data as {
        code?: number;
        msg?: string;
        data?: { image_key?: string; file_key?: string };
      };
      const key = kind === 'image' ? data.data?.image_key : data.data?.file_key;
      if (response.status >= 200 && response.status < 300 && data.code === 0 && key) {
        return { uploaded: true, kind, key, contentType };
      }
      return {
        uploaded: false,
        error: `feishu upload failed: status=${response.status} code=${data.code} msg=${data.msg}`,
      };
    } catch (error) {
      return { uploaded: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private fileNameFromUrl(sourceUrl: string, kind: FeishuUploadKind): string {
    try {
      const pathname = new URL(sourceUrl).pathname;
      const name = pathname.split('/').filter(Boolean).pop();
      if (name && /^[\w. -]{1,160}$/.test(name)) return name;
    } catch {
      // Fall back to a provider-safe name below.
    }
    return kind === 'image' ? 'teable-image' : 'teable-file';
  }

  /**
   * Compose a `text` content payload from the structured IBridgeMessage.
   * Feishu's text cards require markdown-style titles; we keep the body
   * simple so it renders in both text and card mode.
   */
  private buildTextContent(message: IBridgeMessage): string {
    const lines: string[] = [];
    if (message.title) lines.push(`**${message.title}**`);
    lines.push(message.text);
    if (message.fields?.length) {
      for (const f of message.fields) lines.push(`${f.name}: ${f.value}`);
    }
    return lines.join('\n');
  }

  private buildMessagePayload(
    message: IBridgeMessage
  ):
    | { ok: true; msgType: FeishuMessageKind; content: Record<string, unknown> }
    | { ok: false; error: string } {
    const kind = message.kind ?? 'text';
    if (kind === 'text')
      return { ok: true, msgType: kind, content: { text: this.buildTextContent(message) } };
    if (kind === 'image') {
      if (!message.imageKey) return { ok: false, error: 'imageKey is required for image messages' };
      return { ok: true, msgType: kind, content: { image_key: message.imageKey } };
    }
    if (kind === 'file') {
      if (!message.fileKey) return { ok: false, error: 'fileKey is required for file messages' };
      return { ok: true, msgType: kind, content: { file_key: message.fileKey } };
    }
    if (!message.providerPayload) {
      return { ok: false, error: 'providerPayload is required for post messages' };
    }
    return { ok: true, msgType: kind, content: message.providerPayload };
  }
}
