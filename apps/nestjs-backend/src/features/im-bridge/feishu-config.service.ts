/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Feishu config storage — encrypted App ID + App Secret (Stage V57).
 *
 * Stores per-space Feishu bot credentials in the `setting` table under
 * the well-known key `feishu:<spaceId>`. Reuses the same AES-256-GCM
 * envelope as TeamsConfigService so the secrets surface stays one key
 * (`TEABLE_INTEGRATION_SECRET`).
 *
 * License: AGPL-3.0
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

interface IEncryptedToken {
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface IFeishuStoredConfig {
  appId: string;
  appSecret: string;
  receiveId: string;
  receiveIdType: 'chat_id' | 'open_id' | 'email' | 'union_id';
  verificationToken?: string;
  encryptKey?: string;
  createdTime: string;
  lastModifiedTime: string;
}

const KEY = (() => {
  const raw = process.env.TEABLE_INTEGRATION_SECRET;
  if (!raw && process.env.NODE_ENV === 'production') {
    throw new Error('TEABLE_INTEGRATION_SECRET is required for Feishu integration secrets');
  }
  return scryptSync(raw ?? 'teable-local-development-secret', 'teable.salt.v1', 32);
})();

const encryptToken = (plaintext: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const payload: IEncryptedToken = {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
};

const decryptToken = (envelope: string): string => {
  const payload = JSON.parse(Buffer.from(envelope, 'base64').toString('utf8')) as IEncryptedToken;
  const iv = Buffer.from(payload.iv, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
};

const settingNameFor = (spaceId: string) => `feishu:${spaceId}`;

const maskSecret = (s: string): string => {
  if (s.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
};

const wrapAppSecret = (appSecret: string): string => encryptToken(appSecret);

const unwrapAppSecret = (envelope: string): string => {
  try {
    return decryptToken(envelope);
  } catch {
    return envelope; // tolerate legacy plain-text rows
  }
};

@Injectable()
export class FeishuConfigService {
  private readonly logger = new Logger(FeishuConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async saveConfig(
    spaceId: string,
    input: Omit<IFeishuStoredConfig, 'createdTime' | 'lastModifiedTime'>,
    userId: string
  ): Promise<{ ok: true; masked: { appId: string; receiveId: string; receiveIdType: string } }> {
    const now = new Date().toISOString();
    const existing = await this.loadRaw(spaceId);
    let createdTime = now;
    if (existing) {
      try {
        const prev = JSON.parse(existing) as Partial<IFeishuStoredConfig>;
        if (prev.createdTime) createdTime = prev.createdTime;
      } catch {
        // ignore corrupt rows — overwrite
      }
    }
    const stored: IFeishuStoredConfig = {
      appId: input.appId,
      appSecret: wrapAppSecret(input.appSecret),
      receiveId: input.receiveId,
      receiveIdType: input.receiveIdType,
      verificationToken: input.verificationToken ? wrapAppSecret(input.verificationToken) : undefined,
      encryptKey: input.encryptKey ? wrapAppSecret(input.encryptKey) : undefined,
      createdTime,
      lastModifiedTime: now,
    };
    await this.prisma.setting.upsert({
      where: { name: settingNameFor(spaceId) },
      create: {
        name: settingNameFor(spaceId),
        content: JSON.stringify(stored),
        createdBy: userId,
      },
      update: { content: JSON.stringify(stored), lastModifiedBy: userId },
    });
    this.logger.log(`feishu config saved for space=${spaceId} by user=${userId}`);
    return {
      ok: true,
      masked: {
        appId: input.appId,
        receiveId: maskSecret(input.receiveId),
        receiveIdType: input.receiveIdType,
      },
    };
  }

  async getDecryptedConfig(spaceId: string): Promise<IFeishuStoredConfig | null> {
    const raw = await this.loadRaw(spaceId);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<IFeishuStoredConfig>;
      if (!parsed.appId || !parsed.appSecret || !parsed.receiveId || !parsed.receiveIdType) {
        return null;
      }
      return {
        appId: parsed.appId,
        appSecret: unwrapAppSecret(parsed.appSecret),
        receiveId: parsed.receiveId,
        receiveIdType: parsed.receiveIdType,
        verificationToken: parsed.verificationToken ? unwrapAppSecret(parsed.verificationToken) : undefined,
        encryptKey: parsed.encryptKey ? unwrapAppSecret(parsed.encryptKey) : undefined,
        createdTime: parsed.createdTime ?? '',
        lastModifiedTime: parsed.lastModifiedTime ?? '',
      };
    } catch (e) {
      this.logger.warn(`failed to decrypt feishu config for space=${spaceId}: ${String(e)}`);
      return null;
    }
  }

  async getMaskedConfig(spaceId: string): Promise<{
    configured: boolean;
    appId?: string;
    receiveId?: string;
    receiveIdType?: string;
  }> {
    const cfg = await this.getDecryptedConfig(spaceId);
    if (!cfg) return { configured: false };
    return {
      configured: true,
      appId: cfg.appId,
      receiveId: maskSecret(cfg.receiveId),
      receiveIdType: cfg.receiveIdType,
    };
  }

  async clearConfig(spaceId: string): Promise<{ deleted: boolean }> {
    const name = settingNameFor(spaceId);
    const existing = await this.prisma.setting.findUnique({ where: { name } });
    if (!existing) return { deleted: false };
    await this.prisma.setting.delete({ where: { name } });
    this.logger.log(`feishu config cleared for space=${spaceId}`);
    return { deleted: true };
  }

  private async loadRaw(spaceId: string): Promise<string | null> {
    const row = await this.prisma.setting.findUnique({ where: { name: settingNameFor(spaceId) } });
    if (!row) return null;
    if (typeof row.content === 'string') return row.content;
    return JSON.stringify(row.content);
  }
}
