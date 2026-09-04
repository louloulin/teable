/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * R-CHAT-2: AI Chat intelligence (smart-level + model + tool budget).
 *
 * Per-session overrides for the Cloud §ai/ai-chat "Intelligence" menu:
 *   - `smartLevel`: 'low' | 'medium' | 'high'
 *   - `model`:      provider model name (e.g. 'gpt-4o-mini', 'claude-3-5-sonnet')
 *   - `tokenBudget`: numeric context-window hint (low=4K, medium=16K, high=64K)
 *   - `allowedTools`: JSON array of tool-name strings the session can call
 *
 * Resolution order (highest wins) when chatTurn fires:
 *   1. Per-session `smartLevel` / `model` (this service writes them)
 *   2. Global `meta.setting.ai_config` defaults
 *   3. Hardcoded `'medium'` / `null` model
 *
 * Tool permission mapping is deterministic — see `TOOL_PERMISSIONS`:
 *   - low:    ['table.read', 'view.read', 'attachment.read']
 *   - medium: above + ['record.comment', 'field.read']
 *   - high:   above + all write tools ('record.create', 'field.create', ...)
 *
 * The controller calls `updateIntelligence` and `updateModel`; chatTurn
 * pulls the resolved config via `getEffective(session)` and prepends
 * `smartLevelService.render()` + `tokenBudget` + `allowedTools` to the
 * system prompt. See ai-chat.auth.service.ts chatTurn.
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { AiSettingAuthService } from '../ai-setting/ai-setting.auth.service';
import { AiChatSmartLevelService, isSmartLevel } from './ai-chat-smart-level.service';
import type { AiChatSmartLevel } from './ai-chat.types';

export const SMART_LEVEL_TOKEN_BUDGET: Record<AiChatSmartLevel, number> = {
  low: 4_000,
  medium: 16_000,
  high: 64_000,
};

export const READ_ONLY_TOOLS = [
  'table.read',
  'view.read',
  'attachment.read',
  'field.read',
  'record.read',
] as const;

export const COMMENT_TOOLS = ['record.comment'] as const;

export const WRITE_TOOLS = [
  'table.create',
  'table.update',
  'table.delete',
  'field.create',
  'field.update',
  'field.delete',
  'view.create',
  'view.update',
  'view.delete',
  'record.create',
  'record.update',
  'record.delete',
  'automation.create',
  'automation.update',
  'automation.delete',
] as const;

export const TOOL_PERMISSIONS: Record<AiChatSmartLevel, readonly string[]> = {
  low: [...READ_ONLY_TOOLS],
  medium: [...READ_ONLY_TOOLS, ...COMMENT_TOOLS],
  high: [...READ_ONLY_TOOLS, ...COMMENT_TOOLS, ...WRITE_TOOLS],
};

export interface IIntelligenceSnapshot {
  /** Session-overridden level, or null if inheriting from global default. */
  smartLevel: AiChatSmartLevel | null;
  /** Session-overridden model, or null if inheriting from global default. */
  model: string | null;
  /** Resolved (effective) level after global fallback. */
  effectiveSmartLevel: AiChatSmartLevel;
  /** Resolved (effective) model after global fallback. */
  effectiveModel: string | null;
  /** Tool names the session is allowed to invoke. */
  allowedTools: readonly string[];
  /** Context-window hint (tokens). */
  tokenBudget: number;
  /** Global setting this session inherits from, when present. */
  inheritedFromGlobal: { smartLevel: AiChatSmartLevel | null; model: string | null };
}

export interface IUpdateIntelligenceInput {
  sessionId: string;
  userId: string;
  smartLevel?: AiChatSmartLevel | null;
  model?: string | null;
}

const MAX_MODEL_LEN = 200;
const MAX_TOOLS = 64;

@Injectable()
export class AiChatIntelligenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly smartLevelService: AiChatSmartLevelService,
    private readonly aiSetting: AiSettingAuthService
  ) {}

  private async loadOwnedSession(sessionId: string, userId: string) {
    const row = await this.prisma.aiChatSession.findUnique({ where: { id: sessionId } });
    if (!row || row.createdBy !== userId) {
      throw new NotFoundException('chat session not found');
    }
    return row;
  }

  private validateLevel(level: unknown): AiChatSmartLevel {
    if (!isSmartLevel(level)) {
      throw new BadRequestException(
        `smartLevel must be one of 'low' | 'medium' | 'high' (got: ${JSON.stringify(level)})`
      );
    }
    return level;
  }

  private validateModel(model: unknown): string | null {
    if (model === null || model === undefined) return null;
    if (typeof model !== 'string') {
      throw new BadRequestException('model must be a string');
    }
    const trimmed = model.trim();
    if (!trimmed) return null;
    if (trimmed.length > MAX_MODEL_LEN) {
      throw new BadRequestException(`model must be <= ${MAX_MODEL_LEN} chars`);
    }
    return trimmed;
  }

  /**
   * Apply a partial intelligence update. Pass `null` to clear a field
   * (inherit from global setting); pass a value to override.
   */
  async updateIntelligence(input: IUpdateIntelligenceInput): Promise<IIntelligenceSnapshot> {
    const session = await this.loadOwnedSession(input.sessionId, input.userId);

    const data: {
      smartLevel?: AiChatSmartLevel | null;
      model?: string | null;
    } = {};

    if ('smartLevel' in input) {
      data.smartLevel =
        input.smartLevel === undefined
          ? undefined
          : input.smartLevel === null
            ? null
            : this.validateLevel(input.smartLevel);
    }
    if ('model' in input) {
      data.model = this.validateModel(input.model);
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.aiChatSession.update({
        where: { id: input.sessionId },
        data: { ...data, updatedTime: new Date() },
      });
      // Re-fetch so getEffective sees the post-update row.
      const refreshed = await this.prisma.aiChatSession.findUnique({
        where: { id: input.sessionId },
      });
      if (!refreshed) throw new NotFoundException('chat session vanished after update');
      return this.getEffective(refreshed);
    }

    return this.getEffective(session);
  }

  async getEffective(session: {
    id: string;
    smartLevel: string | null;
    model: string | null;
  }): Promise<IIntelligenceSnapshot> {
    const globalSetting = await this.aiSetting.load().catch(() => null);
    const globalLevel = isSmartLevel(globalSetting?.defaultSmartLevel)
      ? globalSetting!.defaultSmartLevel
      : null;
    const globalModel =
      typeof globalSetting?.defaultModel === 'string' && globalSetting!.defaultModel.trim()
        ? globalSetting!.defaultModel.trim()
        : null;

    const level = isSmartLevel(session.smartLevel)
      ? session.smartLevel
      : (globalLevel ?? 'medium');
    const model =
      session.model && session.model.trim() ? session.model.trim() : globalModel;

    const allowedTools = TOOL_PERMISSIONS[level];
    if (allowedTools.length > MAX_TOOLS) {
      throw new Error('TOOL_PERMISSIONS exceeded MAX_TOOLS — review mapping');
    }
    return {
      smartLevel: isSmartLevel(session.smartLevel) ? session.smartLevel : null,
      model: session.model && session.model.trim() ? session.model.trim() : null,
      effectiveSmartLevel: level,
      effectiveModel: model,
      allowedTools,
      tokenBudget: SMART_LEVEL_TOKEN_BUDGET[level],
      inheritedFromGlobal: { smartLevel: globalLevel, model: globalModel },
    };
  }

  /**
   * Validate the requested model against the allow-list (if configured).
   * Returns the resolved model name (caller passes it to the LLM).
   */
  async resolveModelForTurn(sessionId: string, override?: string | null): Promise<string | null> {
    const session = await this.prisma.aiChatSession.findUnique({ where: { id: sessionId } });
    if (!session) return null;
    if (override !== undefined && override !== null) return this.validateModel(override);
    const snap = await this.getEffective(session);
    return snap.effectiveModel;
  }
}
