import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

import { AutomationService } from './automation.service';

export type IMProvider = 'slack' | 'discord' | 'telegram';

/**
 * Config shape stored on `automation_action.config` when
 * `type in ('slack', 'discord', 'telegram')`.
 *
 *   {
 *     organizationId: string,   // required — looked up in
 *                              // OrganizationIntegration
 *     text:           string,   // message body (literal or {{handlebars}})
 *   }
 *
 * The actual target (channel/chat) is resolved by querying the
 * organization_integration table by (organizationId, provider).
 */
export interface IIMActionConfig {
  organizationId: string;
  text: string;
}

/**
 * Encrypted token envelope. Stored in `organization_integration.encrypted_token`
 * as `base64(iv).base64(authTag).base64(ciphertext)`.
 */
interface IEncryptedToken {
  iv: string;
  authTag: string;
  ciphertext: string;
}

const KEY = (() => {
  const raw =
    process.env.TEABLE_INTEGRATION_SECRET ??
    // dev fallback; production must set the env var
    'dev-only-secret-do-not-use-in-prod-32b';
  // Derive a 32-byte key via scrypt — never store raw user input as a key.
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

/**
 * Outbound dispatcher for IM bridge actions.
 *
 * Supported providers:
 *   - slack:     POST chat.postMessage with bearer token
 *   - discord:   POST to a pre-configured webhook URL (stored in `external_ref`)
 *   - telegram:  POST to bot API sendMessage
 *
 * Unsupported (WhatsApp): dispatched with `delivered=false` and an explicit
 * NOT_SUPPORTED error so the run history clearly explains why.
 */
@Injectable()
export class IMBridgeService {
  private readonly logger = new Logger(IMBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly automationService: AutomationService
  ) {}

  /**
   * Resolve an integration by (organizationId, provider) and return the
   * decrypted token + external_ref. Returns null if not configured.
   */
  async resolveIntegration(
    organizationId: string,
    provider: IMProvider
  ): Promise<{ token: string | null; externalRef: string } | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const integration = await (this.prisma as any).organizationIntegration.findFirst({
      where: { organizationId, provider },
    });
    if (!integration) return null;
    return {
      token: integration.encryptedToken ? decryptToken(integration.encryptedToken) : null,
      externalRef: integration.externalRef,
    };
  }

  /**
   * Encrypt-then-store an integration credential. Used by admin tooling
   * (POST /api/admin/integration).
   */
  async upsertIntegration(args: {
    organizationId: string;
    provider: IMProvider;
    externalRef: string;
    token?: string;
    createdBy: string;
  }): Promise<{ id: string }> {
    const encrypted = args.token ? encryptToken(args.token) : null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (this.prisma as any).organizationIntegration.findFirst({
      where: { organizationId: args.organizationId, provider: args.provider, externalRef: args.externalRef },
    });
    if (existing) {
      await (this.prisma as any).organizationIntegration.update({
        where: { id: existing.id },
        data: { encryptedToken: encrypted, lastModifiedTime: new Date() },
      });
      return { id: existing.id };
    }
    const id = `int_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    await (this.prisma as any).organizationIntegration.create({
      data: {
        id,
        organizationId: args.organizationId,
        provider: args.provider,
        externalRef: args.externalRef,
        encryptedToken: encrypted,
        config: {},
        createdBy: args.createdBy,
        createdTime: new Date(),
        lastModifiedTime: new Date(),
      },
    });
    return { id };
  }

  /**
   * Dispatch an IM action by provider. Returns a structured result so
   * the run history can capture what happened (and why on failure).
   */
  async dispatch(args: {
    runId: string;
    provider: IMProvider;
    config: IIMActionConfig;
  }): Promise<{ delivered: boolean; error?: string }> {
    const { runId, provider, config } = args;
    if (provider === ('whatsapp' as IMProvider)) {
      const error = 'whatsapp NOT_SUPPORTED in OSS edition';
      await this.automationService.finishRun(runId, { status: 'failed', error });
      return { delivered: false, error };
    }
    const integration = await this.resolveIntegration(config.organizationId, provider);
    if (!integration) {
      const error = `no ${provider} integration configured for organization ${config.organizationId}`;
      await this.automationService.finishRun(runId, { status: 'skipped', error });
      return { delivered: false, error };
    }
    if (provider !== 'discord' && !integration.token) {
      const error = `${provider} integration missing bot token`;
      await this.automationService.finishRun(runId, { status: 'failed', error });
      return { delivered: false, error };
    }
    try {
      let url: string;
      let init: RequestInit;
      switch (provider) {
        case 'slack':
          url = 'https://slack.com/api/chat.postMessage';
          init = {
            method: 'POST',
            headers: {
              authorization: `Bearer ${integration.token}`,
              'content-type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify({ channel: integration.externalRef, text: config.text }),
          };
          break;
        case 'discord':
          url = integration.externalRef; // already a full webhook URL
          init = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ content: config.text }),
          };
          break;
        case 'telegram':
          url = `https://api.telegram.org/bot${integration.token}/sendMessage`;
          init = {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ chat_id: integration.externalRef, text: config.text }),
          };
          break;
      }
      const res = await fetch(url, init);
      if (!res.ok) {
        const error = `${provider} HTTP ${res.status}`;
        await this.automationService.finishRun(runId, { status: 'failed', error });
        return { delivered: false, error };
      }
      await this.automationService.finishRun(runId, {
        status: 'succeeded',
        output: { delivered: true, provider, status: res.status },
      });
      return { delivered: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await this.automationService.finishRun(runId, { status: 'failed', error });
      return { delivered: false, error };
    }
  }
}

/**
 * Token round-trip helper exported for tests so they can verify the
 * AES-256-GCM envelope without poking into the prisma mock.
 */
export const __test = { encryptToken, decryptToken };
