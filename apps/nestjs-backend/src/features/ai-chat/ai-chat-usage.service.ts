/**
 * AI Chat usage statistics service (Stage 44 — Cloud §ai/ai-chat).
 *
 * Aggregates per-user chat usage from existing `meta.ai_chat_session`
 * and `meta.ai_chat_message` tables. No schema changes — uses Prisma
 * `groupBy` / `count` / `aggregate` only.
 *
 * Endpoints:
 *   - GET /api/chat/usage/summary         → lifetime totals
 *   - GET /api/chat/usage/daily?days=7    → day-bucketed recent stats
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

export interface IAiChatUsageSummary {
  totalSessions: number;
  totalMessages: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalDurationMs: number;
  firstSessionAt: Date | null;
  lastSessionAt: Date | null;
  modelCounts: Array<{ model: string; count: number }>;
}

export interface IAiChatDailyUsage {
  date: string; // YYYY-MM-DD
  sessions: number;
  messages: number;
  promptTokens: number;
  completionTokens: number;
}

export const DEFAULT_DAILY_DAYS = 7;
export const MAX_DAILY_DAYS = 90;

@Injectable()
export class AiChatUsageService {
  private readonly logger = new Logger(AiChatUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async summary(userId: string): Promise<IAiChatUsageSummary> {
    if (!userId) {
      return {
        totalSessions: 0,
        totalMessages: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalDurationMs: 0,
        firstSessionAt: null,
        lastSessionAt: null,
        modelCounts: [],
      };
    }
    try {
      const [sessions, messages, agg] = await Promise.all([
        this.prisma.aiChatSession.findMany({
          where: { createdBy: userId },
          orderBy: { createdTime: 'asc' },
          select: { createdTime: true, model: true },
        }),
        this.prisma.aiChatMessage.count({ where: { session: { createdBy: userId } } }),
        this.prisma.aiChatMessage.aggregate({
          where: { session: { createdBy: userId } },
          _sum: { promptTokens: true, completionTokens: true, durationMs: true },
        }),
      ]);
      const modelMap = new Map<string, number>();
      for (const s of sessions) {
        modelMap.set(s.model, (modelMap.get(s.model) ?? 0) + 1);
      }
      const modelCounts = Array.from(modelMap.entries())
        .map(([model, count]) => ({ model, count }))
        .sort((a, b) => b.count - a.count);
      return {
        totalSessions: sessions.length,
        totalMessages: messages,
        totalPromptTokens: agg._sum.promptTokens ?? 0,
        totalCompletionTokens: agg._sum.completionTokens ?? 0,
        totalDurationMs: agg._sum.durationMs ?? 0,
        firstSessionAt: sessions[0]?.createdTime ?? null,
        lastSessionAt: sessions.at(-1)?.createdTime ?? null,
        modelCounts,
      };
    } catch (error) {
      this.logger.warn(
        `summary failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        totalSessions: 0,
        totalMessages: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalDurationMs: 0,
        firstSessionAt: null,
        lastSessionAt: null,
        modelCounts: [],
      };
    }
  }

  async daily(input: { userId: string; days?: number }): Promise<IAiChatDailyUsage[]> {
    const days = Math.min(Math.max(input.days ?? DEFAULT_DAILY_DAYS, 1), MAX_DAILY_DAYS);
    const now = new Date();
    const start = new Date(now);
    start.setUTCDate(start.getUTCDate() - (days - 1));
    start.setUTCHours(0, 0, 0, 0);
    try {
      const sessions = await this.prisma.aiChatSession.findMany({
        where: {
          createdBy: input.userId,
          createdTime: { gte: start },
        },
        select: { id: true, createdTime: true },
      });
      const messages = await this.prisma.aiChatMessage.findMany({
        where: {
          session: { createdBy: input.userId, createdTime: { gte: start } },
        },
        select: { sessionId: true, promptTokens: true, completionTokens: true, createdTime: true },
      });
      const byDate = new Map<string, IAiChatDailyUsage>();
      for (let i = 0; i < days; i += 1) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        const key = ymd(d);
        byDate.set(key, {
          date: key,
          sessions: 0,
          messages: 0,
          promptTokens: 0,
          completionTokens: 0,
        });
      }
      for (const s of sessions) {
        const key = ymd(s.createdTime);
        const bucket = byDate.get(key);
        if (bucket) bucket.sessions += 1;
      }
      for (const m of messages) {
        const key = ymd(m.createdTime);
        const bucket = byDate.get(key);
        if (bucket) {
          bucket.messages += 1;
          bucket.promptTokens += m.promptTokens ?? 0;
          bucket.completionTokens += m.completionTokens ?? 0;
        }
      }
      return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    } catch (error) {
      this.logger.warn(
        `daily failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
