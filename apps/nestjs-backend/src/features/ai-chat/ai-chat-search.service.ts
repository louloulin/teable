/**
 * AI Chat search service (Stage 40 — Cloud §ai/ai-chat).
 *
 * Lightweight keyword search across the caller's chat history. Ranks
 * sessions by:
 *
 *   1. Title match (+5 per occurrence, capped at 10)
 *   2. User message match (+1 per occurrence, capped at 5)
 *   3. Assistant message match (+0.5 per occurrence, capped at 2)
 *   4. Recency boost (+0.5 if updated in last 24h)
 *
 * Returns up to `take` sessions, ordered by score desc then updatedTime
 * desc. Designed to be a pure additive endpoint with no schema changes.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

export interface IAiChatSearchResult {
  sessionId: string;
  title: string | null;
  baseId: string | null;
  tableId: string | null;
  model: string;
  updatedTime: Date;
  score: number;
  matchedMessages: number;
  snippet?: string;
}

export const MAX_SEARCH_RESULTS = 50;

@Injectable()
export class AiChatSearchService {
  private readonly logger = new Logger(AiChatSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async search(input: {
    userId: string;
    query: string;
    baseId?: string;
    take?: number;
  }): Promise<IAiChatSearchResult[]> {
    const q = (input.query ?? '').trim();
    if (!q) return [];

    const take = Math.min(Math.max(input.take ?? 20, 1), MAX_SEARCH_RESULTS);
    try {
      const sessions = await this.prisma.aiChatSession.findMany({
        where: {
          ...(input.userId ? { createdBy: input.userId } : {}),
          ...(input.baseId ? { baseId: input.baseId } : {}),
        },
        orderBy: { updatedTime: 'desc' },
        take: 200,
        select: {
          id: true,
          baseId: true,
          tableId: true,
          title: true,
          model: true,
          updatedTime: true,
        },
      });
      if (sessions.length === 0) return [];

      const lowered = q.toLowerCase();
      const ids = sessions.map((s) => s.id);
      const messages = await this.prisma.aiChatMessage.findMany({
        where: { sessionId: { in: ids } },
        select: { sessionId: true, role: true, content: true, createdTime: true },
        orderBy: { createdTime: 'desc' },
        take: 5000,
      });

      const messagesBySession = new Map<string, typeof messages>();
      for (const m of messages) {
        const list = messagesBySession.get(m.sessionId) ?? [];
        list.push(m);
        messagesBySession.set(m.sessionId, list);
      }

      const now = Date.now();
      const scored: IAiChatSearchResult[] = [];
      for (const s of sessions) {
        const titleMatches = countOccurrences(s.title ?? '', lowered);
        const sessionMessages = messagesBySession.get(s.id) ?? [];
        let userMatches = 0;
        let assistantMatches = 0;
        let bestSnippet: string | undefined;
        let bestSnippetScore = 0;
        for (const m of sessionMessages) {
          const c = countOccurrences(m.content ?? '', lowered);
          if (m.role === 'user') {
            userMatches += c;
          } else if (m.role === 'assistant') {
            assistantMatches += c;
          }
          if (c > bestSnippetScore) {
            bestSnippetScore = c;
            bestSnippet = extractSnippet(m.content ?? '', lowered);
          }
        }
        const titleScore = Math.min(titleMatches, 10) * 5;
        const userScore = Math.min(userMatches, 5) * 1;
        const assistantScore = Math.min(assistantMatches, 2) * 0.5;
        const ageHours = (now - new Date(s.updatedTime).getTime()) / 3600000;
        const recencyBoost = ageHours <= 24 ? 0.5 : 0;
        const totalMatches = titleMatches + userMatches + assistantMatches;
        const score = titleScore + userScore + assistantScore + recencyBoost;
        if (totalMatches === 0) continue;
        scored.push({
          sessionId: s.id,
          title: s.title,
          baseId: s.baseId,
          tableId: s.tableId,
          model: s.model,
          updatedTime: s.updatedTime,
          score,
          matchedMessages: totalMatches,
          snippet: bestSnippet,
        });
      }

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.updatedTime.getTime() - a.updatedTime.getTime();
      });
      return scored.slice(0, take);
    } catch (error) {
      this.logger.warn(
        `search failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return [];
    }
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (!haystack || !needle) return 0;
  const lowered = haystack.toLowerCase();
  let count = 0;
  let pos = 0;
  while ((pos = lowered.indexOf(needle, pos)) !== -1) {
    count += 1;
    pos += needle.length;
  }
  return count;
}

function extractSnippet(text: string, needle: string, context = 60): string | undefined {
  if (!text || !needle) return undefined;
  const idx = text.toLowerCase().indexOf(needle);
  if (idx === -1) return undefined;
  const start = Math.max(0, idx - context);
  const end = Math.min(text.length, idx + needle.length + context);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '…' + snippet;
  if (end < text.length) snippet = snippet + '…';
  return snippet;
}
