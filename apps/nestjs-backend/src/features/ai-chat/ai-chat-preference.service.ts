/**
 * AI Chat preferences service (Stage 43 — Cloud §ai/ai-chat).
 *
 * Stores per-user chat preferences as JSON in the existing
 * `meta.setting` table under the `aiConfig` entry. Pure code path; no
 * schema changes required.
 *
 * Persisted shape:
 *   aiConfig.chatPreferences = {
 *     "<userId>": {
 *       outputLanguage?: string,    // e.g. "en", "zh-CN", "auto"
 *       responseLength?: "concise" | "normal" | "detailed",
 *       tone?: "neutral" | "friendly" | "formal",
 *       disclaimer?: boolean,       // append accuracy disclaimer
 *     }
 *   }
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

export type ResponseLength = 'concise' | 'normal' | 'detailed';
export type Tone = 'neutral' | 'friendly' | 'formal';

export interface IAiChatPreferences {
  outputLanguage?: string;
  responseLength?: ResponseLength;
  tone?: Tone;
  disclaimer?: boolean;
}

export interface IAiChatPreferenceSetInput {
  outputLanguage?: string;
  responseLength?: ResponseLength;
  tone?: Tone;
  disclaimer?: boolean;
}

const ALLOWED_LENGTHS: ReadonlyArray<ResponseLength> = ['concise', 'normal', 'detailed'];
const ALLOWED_TONES: ReadonlyArray<Tone> = ['neutral', 'friendly', 'formal'];
const PREF_NAMESPACE = 'aiConfig';

@Injectable()
export class AiChatPreferenceService {
  private readonly logger = new Logger(AiChatPreferenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<IAiChatPreferences> {
    if (!userId) return {};
    try {
      const setting = await this.prisma.setting.findUnique({
        where: { name: PREF_NAMESPACE },
      });
      if (!setting?.content) return {};
      const parsed = JSON.parse(setting.content) as {
        chatPreferences?: Record<string, IAiChatPreferences>;
      };
      const entry = parsed.chatPreferences?.[userId];
      return entry ?? {};
    } catch (error) {
      this.logger.warn(
        `get failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return {};
    }
  }

  async update(userId: string, input: IAiChatPreferenceSetInput): Promise<IAiChatPreferences> {
    if (!userId) throw new Error('userId is required');
    const sanitized = this.sanitize(input);
    try {
      const setting = await this.prisma.setting.findUnique({
        where: { name: PREF_NAMESPACE },
      });
      const current: Record<string, unknown> = setting?.content
        ? (JSON.parse(setting.content) as Record<string, unknown>)
        : {};
      const chatPreferences: Record<string, IAiChatPreferences> = {
        ...((current.chatPreferences as Record<string, IAiChatPreferences> | undefined) ?? {}),
        [userId]: { ...((current.chatPreferences as Record<string, IAiChatPreferences> | undefined)?.[userId] ?? {}), ...sanitized },
      };
      const next = { ...current, chatPreferences };
      await this.prisma.setting.upsert({
        where: { name: PREF_NAMESPACE },
        create: {
          name: PREF_NAMESPACE,
          content: JSON.stringify(next),
          createdBy: userId,
        },
        update: { content: JSON.stringify(next) },
      });
      return chatPreferences[userId];
    } catch (error) {
      this.logger.warn(
        `update failed: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Render the preferences as a single prompt fragment for the LLM.
   * Returns empty string when no meaningful preferences are set.
   */
  render(prefs: IAiChatPreferences): string {
    const parts: string[] = [];
    if (prefs.outputLanguage && prefs.outputLanguage !== 'auto') {
      parts.push(`Reply in language "${prefs.outputLanguage}".`);
    }
    if (prefs.responseLength && prefs.responseLength !== 'normal') {
      parts.push(`Response length: ${prefs.responseLength}.`);
    }
    if (prefs.tone && prefs.tone !== 'neutral') {
      parts.push(`Tone: ${prefs.tone}.`);
    }
    if (prefs.disclaimer) {
      parts.push('Append a brief accuracy disclaimer at the end of every reply.');
    }
    if (parts.length === 0) return '';
    return `Preferences:\n${parts.map((p) => `  - ${p}`).join('\n')}`;
  }

  private sanitize(input: IAiChatPreferenceSetInput): IAiChatPreferences {
    const out: IAiChatPreferences = {};
    if (input.outputLanguage && /^[a-zA-Z\-]{2,10}$/.test(input.outputLanguage)) {
      out.outputLanguage = input.outputLanguage;
    }
    if (input.responseLength && ALLOWED_LENGTHS.includes(input.responseLength)) {
      out.responseLength = input.responseLength;
    }
    if (input.tone && ALLOWED_TONES.includes(input.tone)) {
      out.tone = input.tone;
    }
    if (typeof input.disclaimer === 'boolean') {
      out.disclaimer = input.disclaimer;
    }
    return out;
  }
}
