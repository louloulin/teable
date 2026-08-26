import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/**
 * Storage layer for Microsoft Teams webhook URLs.
 *
 * The Teams connector URL is itself a secret — anyone holding it can post
 * a MessageCard into the channel — so we never store the raw URL in the
 * database. Each space has at most one stored config row, keyed by the
 * well-known `name = "teams:<spaceId>"` setting name. The `content`
 * column carries the AES-256-GCM envelope (iv + authTag + ciphertext,
 * all base64-encoded and wrapped in a single JSON blob).
 *
 * Encryption reuses the same envelope pattern as
 * `IMBridgeService` (`TEABLE_INTEGRATION_SECRET` env var → scrypt →
 * 32-byte key). That keeps the secrets surface tight: one key
 * material for all webhook credentials, no per-adapter rotation.
 */

interface IEncryptedToken {
  iv: string;
  authTag: string;
  ciphertext: string;
}

interface ITeamsStoredConfig {
  webhookUrl: string;
  createdTime: string;
  lastModifiedTime: string;
}

const KEY = (() => {
  const raw =
    process.env.TEABLE_INTEGRATION_SECRET ??
    'dev-only-secret-do-not-use-in-prod-32b';
  return scryptSync(raw, 'teable.salt.v1', 32);
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

const settingNameFor = (spaceId: string) => `teams:${spaceId}`;

const maskWebhookUrl = (url: string): string => {
  if (url.length <= 8) return '••••••••';
  return `${'•'.repeat(Math.max(0, url.length - 8))}${url.slice(-8)}`;
};

@Injectable()
export class TeamsConfigService {
  private readonly logger = new Logger(TeamsConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist (or rotate) the Teams webhook URL for a space. Validates first
   * via `TeamsAdapter.validateConfig` so a malformed URL never lands in
   * the setting row.
   */
  async saveConfig(
    spaceId: string,
    webhookUrl: string,
    userId: string
  ): Promise<{ ok: true; masked: string }> {
    const now = new Date().toISOString();
    const cfg: ITeamsStoredConfig = {
      webhookUrl,
      createdTime: now,
      lastModifiedTime: now,
    };
    // Preserve createdTime across rotations — read existing row first.
    const existing = await this.loadRaw(spaceId);
    if (existing) {
      try {
        const prev = JSON.parse(existing) as Partial<ITeamsStoredConfig>;
        if (prev.createdTime) cfg.createdTime = prev.createdTime;
      } catch {
        // existing content unparseable — overwrite with `now` and continue.
      }
    }
    const encrypted = encryptToken(webhookUrl);
    await this.prisma.setting.upsert({
      where: { name: settingNameFor(spaceId) },
      update: {
        content: JSON.stringify({ ...cfg, webhookUrl: encrypted }),
        lastModifiedBy: userId,
      },
      create: {
        name: settingNameFor(spaceId),
        content: JSON.stringify({ ...cfg, webhookUrl: encrypted }),
        createdBy: userId,
      },
    });
    this.logger.log(`teams config saved for space=${spaceId}`);
    return { ok: true, masked: maskWebhookUrl(webhookUrl) };
  }

  /**
   * Return the configured (and decrypted) webhook URL for a space, or
   * null if nothing has been configured. The admin UI only ever sees the
   * masked variant; this method is for internal dispatch use only.
   */
  async getDecryptedWebhookUrl(spaceId: string): Promise<string | null> {
    const raw = await this.loadRaw(spaceId);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<ITeamsStoredConfig>;
      if (!parsed.webhookUrl) return null;
      return decryptToken(parsed.webhookUrl);
    } catch (e) {
      this.logger.warn(`failed to decrypt teams config for space=${spaceId}: ${String(e)}`);
      return null;
    }
  }

  /**
   * Masked view of the stored webhook URL for the admin UI. The last
   * 8 characters are preserved so the admin can sanity-check that they
   * pasted the right URL (Teams connector URLs end in a stable token
   * suffix that uniquely identifies the channel).
   */
  async getMaskedConfig(spaceId: string): Promise<{
    configured: boolean;
    webhookUrl?: string;
  }> {
    const url = await this.getDecryptedWebhookUrl(spaceId);
    if (!url) return { configured: false };
    return { configured: true, webhookUrl: maskWebhookUrl(url) };
  }

  /**
   * Clear the configured webhook for a space. Idempotent — returns false
   * if nothing was set, true if a row was actually deleted.
   */
  async clearConfig(spaceId: string): Promise<{ deleted: boolean }> {
    const name = settingNameFor(spaceId);
    const existing = await this.prisma.setting.findUnique({ where: { name } });
    if (!existing) return { deleted: false };
    await this.prisma.setting.delete({ where: { name } });
    this.logger.log(`teams config cleared for space=${spaceId}`);
    return { deleted: true };
  }

  private async loadRaw(spaceId: string): Promise<string | null> {
    const row = await this.prisma.setting.findUnique({
      where: { name: settingNameFor(spaceId) },
    });
    return row?.content ?? null;
  }
}

export const __teamsConfigTest = { encryptToken, decryptToken, maskWebhookUrl };
