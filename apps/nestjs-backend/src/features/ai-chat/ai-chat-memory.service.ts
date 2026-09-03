/**
 * AI Chat memory service (Stage 39 — Cloud §ai/ai-chat).
 *
 * Maintains lightweight per-user memory without persisting a new table:
 *
 *   - **Recent topics**: titles of the last 3 chat sessions the user
 *     created in the same baseId (or globally when none provided).
 *   - **Recent snippets**: up to 5 most recent user messages across
 *     those sessions (truncated to 120 chars each).
 *
 * Output is rendered as a single prompt block that the chat service
 * prepends to the conversation so the assistant can recall prior
 * discussions without us shipping a full Memory pipeline yet.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

export interface IAiChatMemory {
  topics: ReadonlyArray<string>;
  snippets: ReadonlyArray<string>;
  recentSessionCount: number;
}

export const MAX_MEMORY_SESSIONS = 3;
export const MAX_MEMORY_SNIPPETS = 5;
export const MEMORY_SNIPPET_MAX_LEN = 120;

@Injectable()
export class AiChatMemoryService {
  private readonly logger = new Logger(AiChatMemoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async load(input: { userId: string; baseId?: string | null }): Promise<IAiChatMemory> {
    try {
      const sessions = await this.prisma.aiChatSession.findMany({
        where: {
          createdBy: input.userId,
          ...(input.baseId ? { baseId: input.baseId } : {}),
        },
        orderBy: { updatedTime: 'desc' },
        take: MAX_MEMORY_SESSIONS,
        select: { id: true, title: true, baseId: true },
      });
      const topics = sessions
        .map((s) => s.title)
        .filter((t): t is string => t !== null && t.length > 0)
        .slice(0, MAX_MEMORY_SESSIONS);

      if (sessions.length === 0) {
        return { topics: [], snippets: [], recentSessionCount: 0 };
      }

      const recentMessages = await this.prisma.aiChatMessage.findMany({
        where: {
          sessionId: { in: sessions.map((s) => s.id) },
          role: 'user',
        },
        orderBy: { createdTime: 'desc' },
        take: MAX_MEMORY_SNIPPETS,
        select: { content: true },
      });
      const snippets = recentMessages
        .map((m) => (m.content ?? '').slice(0, MEMORY_SNIPPET_MAX_LEN).trim())
        .filter((s) => s.length > 0);

      return {
        topics,
        snippets,
        recentSessionCount: sessions.length,
      };
    } catch (error) {
      this.logger.warn(
        `load failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { topics: [], snippets: [], recentSessionCount: 0 };
    }
  }

  render(memory: IAiChatMemory): string {
    if (memory.topics.length === 0 && memory.snippets.length === 0) return '';
    const lines: string[] = [];
    lines.push('Memory:');
    if (memory.topics.length > 0) {
      lines.push(`  Recent topics (${memory.topics.length}): ${memory.topics.join(' | ')}`);
    }
    if (memory.snippets.length > 0) {
      lines.push(`  Recent user messages:`);
      for (const snippet of memory.snippets) {
        lines.push(`    - ${snippet}`);
      }
    }
    return lines.join('\n');
  }
}
