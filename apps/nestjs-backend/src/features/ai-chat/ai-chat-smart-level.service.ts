/**
 * AI Chat smart level service (Stage 54 — Cloud §ai/ai-chat 智能级别).
 *
 * Implements "reasoning intensity" per Cloud docs:
 *   - 'low'    → concise direct answer
 *   - 'medium' → step-by-step with brief explanation
 *   - 'high'   → deep reasoning + explore alternatives + validate assumptions
 *
 * Resolution order (highest wins):
 *   1. Caller-provided `override` (per-turn)
 *   2. Global `defaultSmartLevel` from `meta.setting.ai_config`
 *   3. Hardcoded 'medium'
 *
 * Render as a system-prompt block that the LLM follows without needing
 * any model-side config.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { AiSettingAuthService } from '../ai-setting/ai-setting.auth.service';
import type { AiChatSmartLevel } from './ai-chat.types';

const SMART_LEVEL_VALUES: ReadonlyArray<AiChatSmartLevel> = ['low', 'medium', 'high'];

export function isSmartLevel(value: unknown): value is AiChatSmartLevel {
  return typeof value === 'string' && (SMART_LEVEL_VALUES as ReadonlyArray<string>).includes(value);
}

@Injectable()
export class AiChatSmartLevelService {
  private readonly logger = new Logger(AiChatSmartLevelService.name);

  constructor(@Optional() private readonly aiSetting?: AiSettingAuthService) {}

  /**
   * Resolve the effective smart level for a turn.
   * Returns one of 'low' | 'medium' | 'high'.
   */
  async resolve(override?: AiChatSmartLevel): Promise<AiChatSmartLevel> {
    if (isSmartLevel(override)) return override;
    if (this.aiSetting) {
      try {
        const cfg = await this.aiSetting.load();
        if (isSmartLevel(cfg.defaultSmartLevel)) return cfg.defaultSmartLevel;
      } catch (error) {
        this.logger.warn(
          `resolve: failed to load ai config: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    return 'medium';
  }

  /**
   * Render the smart level as a system-prompt block. Always returns a
   * non-empty string so the caller can prepend it without checking.
   */
  render(level: AiChatSmartLevel): string {
    switch (level) {
      case 'low':
        return [
          'Smart level: LOW.',
          'Reply in the shortest form that fully answers the user.',
          'Avoid alternatives, exploration, or self-justification.',
        ].join(' ');
      case 'high':
        return [
          'Smart level: HIGH.',
          'Reason deeply before answering.',
          'Enumerate relevant sub-questions, weigh alternatives,',
          'state assumptions explicitly, and validate the conclusion',
          'against the available context before replying.',
        ].join(' ');
      case 'medium':
      default:
        return [
          'Smart level: MEDIUM.',
          'Think step by step and give a concise but complete answer.',
          'Briefly note key assumptions when they affect the result.',
        ].join(' ');
    }
  }
}
