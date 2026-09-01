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


function safeParseJson(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

/**
 * Mirror admin-set gateway credentials (`apiKey`, `baseUrl`) into the
 * canonical `meta.setting.aiConfig` row so the AI runtime
 * (`ai.service.ts`) can pick them up via SettingService.getSetting() and
 * `SettingKey.AI_CONFIG = 'aiConfig'`. Without this mirror, admin UI
 * changes never reach `ai.service` because it reads `name='aiConfig'`
 * while this module persists to `name='ai_config'`.
 */
async function mirrorGatewayToAiConfig(
  prisma: PrismaService,
  setting: { apiKey: string | null; baseUrl: string | null }
): Promise<void> {
  const AI_CONFIG_CANONICAL = 'aiConfig';
  const existing = await prisma.setting.findFirst({
    where: { name: AI_CONFIG_CANONICAL },
    select: { content: true },
  });
  // Always overwrite — callers (setGateway) decide whether null = clear.
  const merged = {
    ...safeParseJson(existing?.content),
    aiGatewayApiKey: setting.apiKey,
    aiGatewayBaseUrl: setting.baseUrl,
  };
  const userId = 'admin_ai_setting_mirror';
  await prisma.setting.upsert({
    where: { name: AI_CONFIG_CANONICAL },
    create: {
      name: AI_CONFIG_CANONICAL,
      content: JSON.stringify(merged),
      createdBy: userId,
    },
    update: {
      content: JSON.stringify(merged),
      lastModifiedBy: userId,
    },
  });
}

/**
 * Mirror `defaultModel` into `meta.setting.aiConfig.chatModel` so admin UI
 * changes actually reach `ai.service.getChatModelInstance`. Without this
 * mirror, defaultModel is only stored in the ai_setting row and never
 * affects runtime behavior. Splits on `/` to decide gateway vs standard:
 *   - contains '/' → gateway model (anthropic/claude-sonnet-4)
 *     chatModel.{lg,md,sm} = `<model>@teable` (instance-level suffix)
 *   - otherwise → standard model (gpt-4o-mini)
 *     chatModel.{lg,md,sm} = `openai@<model>@teable`
 *     and ensures a matching llmProviders entry exists.
 */
async function mirrorDefaultModelToAiConfig(
  prisma: PrismaService,
  defaultModel: string
): Promise<void> {
  if (!defaultModel || typeof defaultModel !== 'string') return;
  const AI_CONFIG_CANONICAL = 'aiConfig';
  const existing = await prisma.setting.findFirst({
    where: { name: AI_CONFIG_CANONICAL },
    select: { content: true },
  });
  const parsed = safeParseJson(existing?.content);
  const isGateway = defaultModel.includes('/');
  const modelKey = isGateway
    ? `${defaultModel}@teable`
    : `openai@${defaultModel}@teable`;
  const nextChatModel = {
    ...((parsed.chatModel as Record<string, unknown>) ?? {}),
    lg: modelKey,
    md: modelKey,
    sm: modelKey,
  };
  let llmProviders = (parsed.llmProviders as Array<Record<string, unknown>>) ?? [];
  if (!isGateway) {
    const openaiIdx = llmProviders.findIndex(
      (p) => String(p.type).toLowerCase() === 'openai'
    );
    if (openaiIdx === -1) {
      llmProviders = [
        ...llmProviders,
        {
          type: 'openai',
          name: 'teable',
          apiKey: '',
          baseUrl: 'https://api.openai.com/v1',
          models: defaultModel,
        },
      ];
    } else {
      const cur = llmProviders[openaiIdx];
      const models = String(cur.models ?? '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
      if (!models.includes(defaultModel)) models.push(defaultModel);
      llmProviders = [
        ...llmProviders.slice(0, openaiIdx),
        { ...cur, models: models.join(',') },
        ...llmProviders.slice(openaiIdx + 1),
      ];
    }
  }
  const merged = {
    ...parsed,
    chatModel: nextChatModel,
    llmProviders,
  };
  const userId = 'admin_ai_setting_default_model';
  await prisma.setting.upsert({
    where: { name: AI_CONFIG_CANONICAL },
    create: {
      name: AI_CONFIG_CANONICAL,
      content: JSON.stringify(merged),
      createdBy: userId,
    },
    update: {
      content: JSON.stringify(merged),
      lastModifiedBy: userId,
    },
  });
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

  /**
   * Internal helper: run gateway + default-model mirrors in sequence with
   * explicit values. Callers (setGateway, setDefaultModel) choose which
   * mirrors to invoke so that null clears and undefined preserves.
   */
  async syncMirrors(args: {
    gateway?: { apiKey: string | null; baseUrl: string | null };
    defaultModel?: string;
  }): Promise<void> {
    if (args.gateway) {
      await mirrorGatewayToAiConfig(this.prisma, args.gateway);
    }
    if (args.defaultModel) {
      await mirrorDefaultModelToAiConfig(this.prisma, args.defaultModel);
    }
  }

  /** Flip the global enabled flag. */
  async setEnabled(enabled: boolean): Promise<IAiSetting> {
    return this.update({ enabled });
  }

  /** Update default model + smart level together. */
  async setDefaultModel(defaultModel: string, smartLevel?: IAiSetting['defaultSmartLevel']): Promise<IAiSetting> {
    const input: Partial<IAiSetting> = { defaultModel };
    if (smartLevel) input.defaultSmartLevel = smartLevel;
    const result = await this.update(input);
    await this.syncMirrors({ defaultModel });
    return result;
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
    await this.syncMirrors({ gateway: { apiKey, baseUrl: baseUrl ?? current.aiGatewayBaseUrl ?? null } });
    return {
      aiGatewayApiKey: next.aiGatewayApiKey,
      aiGatewayBaseUrl: next.aiGatewayBaseUrl,
    };
  }
}
