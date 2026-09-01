/**
 * AI Admin Setting — NestJS auth service (Round-AI-3).
 *
 * Backed by `meta.setting` (name='ai_config') so the existing getAiSettings()
 * admin endpoint continues to work unchanged.  Adds structured write helpers
 * so HTTP CRUD can flip flags / update policy / set default model.
 *
 * License: AGPL-3.0
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import type { IAiCreditPolicy, IAiSetting } from './ai-setting.types';
import { DEFAULT_AI_SETTING } from './ai-setting.types';
import { SettingService } from '../setting/setting.service';

const AI_CONFIG_NAME = 'ai_config';

function safeIso(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  if (d instanceof Date) return d.toISOString();
  return new Date(d).toISOString();
}

function normalize(input: Partial<IAiSetting> | null | undefined, prev?: IAiSetting): IAiSetting {
  const base: IAiSetting = prev ?? DEFAULT_AI_SETTING;
  return {
    enabled: input?.enabled ?? base.enabled,
    defaultModel: input?.defaultModel ?? base.defaultModel,
    defaultSmartLevel: input?.defaultSmartLevel ?? base.defaultSmartLevel,
    creditPolicy: {
      perUserDailyCap: input?.creditPolicy?.perUserDailyCap ?? base.creditPolicy.perUserDailyCap,
      perOrgDailyCap: input?.creditPolicy?.perOrgDailyCap ?? base.creditPolicy.perOrgDailyCap,
      refundOnFailure: input?.creditPolicy?.refundOnFailure ?? base.creditPolicy.refundOnFailure,
    },
    allowCustomModels: input?.allowCustomModels ?? base.allowCustomModels,
    streamingEnabled: input?.streamingEnabled ?? base.streamingEnabled,
    aiGatewayApiKey:
      input?.aiGatewayApiKey !== undefined ? input.aiGatewayApiKey : base.aiGatewayApiKey,
    aiGatewayBaseUrl:
      input?.aiGatewayBaseUrl !== undefined ? input.aiGatewayBaseUrl : base.aiGatewayBaseUrl,
    updatedAt: new Date().toISOString(),
  };
}

@Injectable()
export class AiSettingAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingService: SettingService
  ) {}

  /** Load current setting (returns defaults if unset). */
  async load(): Promise<IAiSetting> {
    const row = await this.prisma.setting.findFirst({
      where: { name: AI_CONFIG_NAME },
      select: { content: true, lastModifiedTime: true },
    });
    if (!row) return { ...DEFAULT_AI_SETTING, updatedAt: new Date().toISOString() };
    let raw: unknown = row.content;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = null;
      }
    }
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_AI_SETTING, updatedAt: safeIso(row.lastModifiedTime) };
    return normalize(raw as Partial<IAiSetting>, DEFAULT_AI_SETTING);
  }

  /** Persist a full or partial setting. */
  async update(input: Partial<IAiSetting>): Promise<IAiSetting> {
    const next = normalize(input, await this.load());
    const json = JSON.stringify({
      enabled: next.enabled,
      defaultModel: next.defaultModel,
      defaultSmartLevel: next.defaultSmartLevel,
      creditPolicy: next.creditPolicy,
      allowCustomModels: next.allowCustomModels,
      streamingEnabled: next.streamingEnabled,
      aiGatewayApiKey: next.aiGatewayApiKey,
      aiGatewayBaseUrl: next.aiGatewayBaseUrl,
    });
    const userId = 'admin_ai_setting';
    await this.prisma.setting.upsert({
      where: { name: AI_CONFIG_NAME },
      create: { name: AI_CONFIG_NAME, content: json, createdBy: userId },
      update: { content: json, lastModifiedBy: userId },
    });
    return next;
  }

  /** Flip the global enabled flag. */
  async setEnabled(enabled: boolean): Promise<IAiSetting> {
    return this.update({ enabled });
  }

  /** Update default model + smart level together. */
  async setDefaultModel(defaultModel: string, smartLevel?: IAiSetting['defaultSmartLevel']): Promise<IAiSetting> {
    const input: Partial<IAiSetting> = { defaultModel };
    if (smartLevel) input.defaultSmartLevel = smartLevel;
    return this.update(input);
  }

  /** Update credit policy. */
  async updateCreditPolicy(policy: Partial<IAiCreditPolicy>): Promise<IAiSetting> {
    return this.update({ creditPolicy: { ...(await this.load()).creditPolicy, ...policy } });
  }

  /**
   * R-AI-7: Configure or clear the instance-level Admin AI Gateway.
   *
   * Setting `apiKey` to null disables the gateway; supplying a non-empty
   * string enables it. `baseUrl` is optional (defaults to Vercel's gateway
   * inside `ai.service.ts`).
   *
   * The setting is persisted into `meta.setting.aiConfig.{aiGatewayApiKey,aiGatewayBaseUrl}`
   * via the existing `update()` path. After successful update, the gateway
   * key is honored on every subsequent `/api/cuppy/chat` and
   * `/api/:baseId/ai/generate-stream` call for bases that have not overridden
   * their own LLM provider.
   */
  async setGateway(
    apiKey: string | null,
    baseUrl: string | null
  ): Promise<{ aiGatewayApiKey: string | null; aiGatewayBaseUrl: string | null }> {
    const current = await this.load();
    const next = await this.update({
      ...current,
      aiGatewayApiKey: apiKey,
      aiGatewayBaseUrl: baseUrl ?? current.aiGatewayBaseUrl ?? null,
    });
    return {
      aiGatewayApiKey: next.aiGatewayApiKey,
      aiGatewayBaseUrl: next.aiGatewayBaseUrl,
    };
  }
}
