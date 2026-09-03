/**
 * Custom AI Model — NestJS auth service.
 *
 * Persists custom-model rows in the existing `meta.byok_llm_key` table,
 * tagged with provider names starting `custom-` so we don't need a schema
 * migration.  All HTTP-facing helpers live here; the controller is a thin
 * adapter on top.
 *
 * License: AGPL-3.0
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { safeFetch } from '../../utils/ssrf-http';
import type {
  ICustomAiModelBatchTestResult,
  ICustomAiModel,
  ICustomAiModelTestResult,
  ICustomAiModelUsage,
  ICreateCustomAiModelInput,
  IUpdateCustomAiModelInput,
  CustomAiProvider,
  CustomAiIsolation,
} from './custom-ai-model.types';
import { SUPPORTED_CUSTOM_PROVIDERS } from './custom-ai-model.types';

/** Trivial SHA-256-ish hash for fingerprint + storage key derivation. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function safeIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

interface IStoredModelConfig {
  baseUrl?: string;
  modelName: string;
  imageGenerationModel?: boolean;
  apiKey?: string;
}

const integrationSecret = process.env.TEABLE_INTEGRATION_SECRET;
if (!integrationSecret && process.env.NODE_ENV === 'production') {
  throw new Error('TEABLE_INTEGRATION_SECRET is required for custom AI model secrets');
}
const MODEL_SECRET_KEY = scryptSync(
  integrationSecret ?? 'teable-local-development-secret',
  'teable.custom-ai-model.v1',
  32
);

function encryptConfig(config: IStoredModelConfig): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', MODEL_SECRET_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return `v1:${Buffer.from(
    JSON.stringify({
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    })
  ).toString('base64')}`;
}

function decryptConfig(value: unknown): IStoredModelConfig | null {
  if (typeof value !== 'string' || !value.startsWith('v1:')) return null;
  try {
    const payload = JSON.parse(Buffer.from(value.slice(3), 'base64').toString('utf8')) as {
      iv: string;
      tag: string;
      ciphertext: string;
    };
    const decipher = createDecipheriv(
      'aes-256-gcm',
      MODEL_SECRET_KEY,
      Buffer.from(payload.iv, 'base64')
    );
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(payload.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8')
    ) as IStoredModelConfig;
  } catch {
    return null;
  }
}

function isCustomProvider(provider: string): provider is CustomAiProvider {
  return (SUPPORTED_CUSTOM_PROVIDERS as string[]).includes(provider);
}

function toDomain(row: Record<string, unknown>): ICustomAiModel {
  const stored = decryptConfig(row['ciphertextRef']);
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    provider: isCustomProvider(String(row['provider']))
      ? (String(row['provider']) as CustomAiProvider)
      : 'custom-openai',
    alias: String(row['alias']),
    ...(stored?.baseUrl ? { baseUrl: stored.baseUrl } : {}),
    modelName:
      stored?.modelName ??
      (String(row['alias']).includes(':')
        ? String(row['alias']).split(':').slice(1).join(':')
        : String(row['alias'])),
    imageGenerationModel: stored?.imageGenerationModel ?? false,
    apiKeyId: row['fingerprint'] ? String(row['fingerprint']) : undefined,
    status: (String(row['status']) as ICustomAiModel['status']) || 'active',
    isolation: (String(row['isolation']) as CustomAiIsolation) || 'shared',
    createdAt: safeIso(row['createdAt'] as Date) ?? new Date().toISOString(),
    updatedAt: safeIso(row['updatedAt'] as Date) ?? new Date().toISOString(),
  };
}

@Injectable()
export class CustomAiModelAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private customProviderFilter(): { provider: { startsWith: string } } {
    return { provider: { startsWith: 'custom-' } };
  }

  /** List all custom models for an org. */
  async listModels(orgId: string): Promise<ICustomAiModel[]> {
    const rows = await this.prisma.byokLlmKey.findMany({
      where: { orgId, ...this.customProviderFilter() },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r: Record<string, unknown>) => toDomain(r));
  }

  /** Load a single custom model by id (org-scoped). */
  async loadModel(orgId: string, id: string): Promise<ICustomAiModel | null> {
    const row = await this.prisma.byokLlmKey.findUnique({ where: { id } });
    if (!row) return null;
    const model = toDomain(row);
    return model.orgId === orgId ? model : null;
  }

  /** Create a custom model entry. */
  async createModel(input: ICreateCustomAiModelInput): Promise<ICustomAiModel> {
    const id = `cam_${fnv1a(`${input.orgId}:${input.alias}:${Date.now()}`)}`;
    const fingerprint = input.apiKey ? fnv1a(`${input.orgId}:${input.alias}:${input.apiKey}`) : '';
    const row = await this.prisma.byokLlmKey.create({
      data: {
        id,
        orgId: input.orgId,
        provider: input.provider,
        alias: input.alias,
        status: 'active',
        ciphertextRef: encryptConfig({
          ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
          modelName: input.modelName,
          imageGenerationModel: input.imageGenerationModel ?? false,
          ...(input.apiKey ? { apiKey: input.apiKey } : {}),
        }),
        fingerprint: fingerprint || 'no-key',
        isolation: input.isolation ?? 'shared',
        providerTpmCap: 0,
        orgDailyCap: 0,
      } as never,
    });
    return toDomain(row as unknown as Record<string, unknown>);
  }

  /** Update a custom model. */
  // eslint-disable-next-line sonarjs/cognitive-complexity
  async updateModel(
    orgId: string,
    id: string,
    input: IUpdateCustomAiModelInput
  ): Promise<ICustomAiModel | null> {
    const existing = await this.loadModel(orgId, id);
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (input.alias !== undefined) data['alias'] = input.alias;
    if (input.status !== undefined) data['status'] = input.status;
    if (input.isolation !== undefined) data['isolation'] = input.isolation;
    if (
      input.baseUrl !== undefined ||
      input.modelName !== undefined ||
      input.imageGenerationModel !== undefined ||
      input.apiKey
    ) {
      const fp = input.apiKey
        ? fnv1a(`${orgId}:${input.alias ?? existing.alias}:${input.apiKey}`)
        : undefined;
      const current = decryptConfig(
        (await this.prisma.byokLlmKey.findUnique({ where: { id } }))?.ciphertextRef
      ) ?? {
        modelName: existing.modelName,
      };
      data['ciphertextRef'] = encryptConfig({
        ...(input.baseUrl !== undefined
          ? { baseUrl: input.baseUrl }
          : current.baseUrl
            ? { baseUrl: current.baseUrl }
            : {}),
        modelName: input.modelName ?? current.modelName,
        imageGenerationModel:
          input.imageGenerationModel ??
          current.imageGenerationModel ??
          existing.imageGenerationModel,
        ...(input.apiKey
          ? { apiKey: input.apiKey }
          : current.apiKey
            ? { apiKey: current.apiKey }
            : {}),
      });
      if (fp) data['fingerprint'] = fp;
    }
    const row = await this.prisma.byokLlmKey.update({
      where: { id },
      data: data as never,
    });
    return toDomain(row as unknown as Record<string, unknown>);
  }

  /** Delete a custom model. */
  async deleteModel(orgId: string, id: string): Promise<boolean> {
    const existing = await this.loadModel(orgId, id);
    if (!existing) return false;
    await this.prisma.byokLlmKey.delete({ where: { id } });
    return true;
  }

  /** Test connectivity to a custom model. */
  async testModel(orgId: string, id: string): Promise<ICustomAiModelTestResult> {
    const model = await this.loadModel(orgId, id);
    if (!model) {
      return { ok: false, message: 'model not found', testedAt: new Date().toISOString() };
    }
    const start = Date.now();
    const row = await this.prisma.byokLlmKey.findUnique({ where: { id } });
    const config = decryptConfig(row?.ciphertextRef);
    if (!config?.baseUrl || !config.modelName) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: 'baseUrl/modelName are not configured',
        testedAt: new Date().toISOString(),
      };
    }
    try {
      const response = await this.requestModel(model, config);
      return {
        ok: response.ok,
        latencyMs: Date.now() - start,
        message: response.message,
        capabilities: {
          chat: response.chat,
          vision: response.vision,
          imageGeneration: response.imageGeneration,
        },
        testedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : String(error),
        testedAt: new Date().toISOString(),
      };
    }
  }

  async batchTest(orgId: string): Promise<ICustomAiModelBatchTestResult> {
    const models = await this.listModels(orgId);
    const results = await Promise.all(
      models.map(async (model) => ({
        ...(await this.testModel(orgId, model.id)),
        modelId: model.id,
        alias: model.alias,
      }))
    );
    return { testedAt: new Date().toISOString(), results };
  }

  private async requestModel(
    model: ICustomAiModel,
    config: IStoredModelConfig
  ): Promise<{
    ok: boolean;
    message: string;
    chat: boolean;
    vision: boolean;
    imageGeneration: boolean;
  }> {
    const baseUrl = config.baseUrl!.replace(/\/$/, '');
    const headers: Record<string, string> = { ['content-type']: 'application/json' };
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
    const isAnthropic = model.provider === 'custom-anthropic';
    if (isAnthropic && config.apiKey) headers['x-api-key'] = config.apiKey;

    const chatEndpoint = isAnthropic ? `${baseUrl}/messages` : `${baseUrl}/chat/completions`;
    const chatBody = isAnthropic
      ? {
          model: config.modelName,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
        }
      : {
          model: config.modelName,
          max_tokens: 8,
          messages: [{ role: 'user', content: 'Reply with OK.' }],
        };
    const chatResponse = await safeFetch(chatEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(chatBody),
    });
    const chat = chatResponse.ok;
    let vision = false;
    let imageGeneration = false;

    if (chat) {
      const visionBody = isAnthropic
        ? {
            model: config.modelName,
            max_tokens: 8,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Reply with OK.' },
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: 'image/png',
                      data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                    },
                  },
                ],
              },
            ],
          }
        : {
            model: config.modelName,
            max_tokens: 8,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: 'Reply with OK.' },
                  {
                    type: 'image_url',
                    image_url: {
                      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                    },
                  },
                ],
              },
            ],
          };
      const visionResponse = await safeFetch(chatEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(visionBody),
      });
      vision = visionResponse.ok;
    }

    if (config.imageGenerationModel && !isAnthropic) {
      const imageResponse = await safeFetch(`${baseUrl}/images/generations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: config.modelName,
          prompt: 'Generate a small abstract blue square.',
          n: 1,
          size: '256x256',
        }),
      });
      imageGeneration = imageResponse.ok;
    }

    return {
      ok: chat,
      chat,
      vision,
      imageGeneration,
      message: `provider=${model.provider} model=${config.modelName} chat=${chat} vision=${vision} imageGeneration=${imageGeneration}`,
    };
  }

  /** Aggregate usage for custom models in an org. */
  async usage(orgId: string): Promise<ICustomAiModelUsage> {
    const [models, attempts] = await Promise.all([
      this.listModels(orgId),
      this.prisma.byokLlmAttempt.findMany({ where: { orgId } }),
    ]);
    const byKey = new Map<string, { requests: number; tokens: number }>();
    for (const a of attempts as Array<Record<string, unknown>>) {
      const k = String(a['keyId']);
      const t = Number(a['tokens']);
      const e = byKey.get(k) ?? { requests: 0, tokens: 0 };
      e.requests += 1;
      e.tokens += Number.isFinite(t) ? t : 0;
      byKey.set(k, e);
    }
    const byModel = models.map((m) => {
      const u = byKey.get(m.id) ?? { requests: 0, tokens: 0 };
      return { modelId: m.id, alias: m.alias, requests: u.requests, tokens: u.tokens };
    });
    return {
      orgId,
      totalRequests: byModel.reduce((s, x) => s + x.requests, 0),
      totalTokens: byModel.reduce((s, x) => s + x.tokens, 0),
      byModel,
    };
  }

  /** Supported provider list. */
  listProviders(): { providers: CustomAiProvider[]; count: number } {
    return { providers: SUPPORTED_CUSTOM_PROVIDERS, count: SUPPORTED_CUSTOM_PROVIDERS.length };
  }
}
