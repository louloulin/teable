/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatMemoryService, MEMORY_SNIPPET_MAX_LEN } from './ai-chat-memory.service';

function buildPrisma(input: {
  sessions?: Array<{ id: string; title: string | null; baseId: string | null }>;
  messages?: Array<{ sessionId: string; content: string; role?: string }>;
}) {
  return {
    aiChatSession: {
      findMany: vi.fn(async () => input.sessions ?? []),
    },
    aiChatMessage: {
      findMany: vi.fn(async () =>
        (input.messages ?? []).map((m) => ({ content: m.content }))
      ),
    },
  };
}

describe('AiChatMemoryService (Stage 39)', () => {
  let svc: AiChatMemoryService;

  beforeEach(() => {
    svc = new AiChatMemoryService(buildPrisma({}) as never);
  });

  it('returns empty memory when there are no sessions', async () => {
    const out = await svc.load({ userId: 'u1' });
    expect(out).toEqual({ topics: [], snippets: [], recentSessionCount: 0 });
  });

  it('collects topics from session titles', async () => {
    const prisma = buildPrisma({
      sessions: [
        { id: 's1', title: 'Analyze Q3 sales', baseId: 'bse1' },
        { id: 's2', title: 'Filter duplicates', baseId: 'bse1' },
        { id: 's3', title: null, baseId: 'bse1' },
      ],
    });
    const s = new AiChatMemoryService(prisma as never);
    const out = await s.load({ userId: 'u1', baseId: 'bse1' });
    expect(out.topics).toEqual(['Analyze Q3 sales', 'Filter duplicates']);
    expect(out.recentSessionCount).toBe(3);
  });

  it('collects recent user messages truncated to MEMORY_SNIPPET_MAX_LEN', async () => {
    const longMsg = 'x'.repeat(MEMORY_SNIPPET_MAX_LEN * 3);
    const prisma = buildPrisma({
      sessions: [{ id: 's1', title: 'Test', baseId: 'bse1' }],
      messages: [
        { sessionId: 's1', content: longMsg },
        { sessionId: 's1', content: 'short message' },
      ],
    });
    const s = new AiChatMemoryService(prisma as never);
    const out = await s.load({ userId: 'u1' });
    expect(out.snippets).toHaveLength(2);
    expect(out.snippets[0].length).toBeLessThanOrEqual(MEMORY_SNIPPET_MAX_LEN);
  });

  it('renders the memory block with topics + snippets', () => {
    const rendered = svc.render({
      topics: ['Topic A', 'Topic B'],
      snippets: ['first snippet', 'second snippet'],
      recentSessionCount: 2,
    });
    expect(rendered).toContain('Memory:');
    expect(rendered).toContain('Topic A | Topic B');
    expect(rendered).toContain('- first snippet');
  });

  it('renders empty string when there is no memory', () => {
    expect(svc.render({ topics: [], snippets: [], recentSessionCount: 0 })).toBe('');
  });

  it('gracefully degrades when prisma throws', async () => {
    const broken = new AiChatMemoryService({
      aiChatSession: { findMany: vi.fn(async () => { throw new Error('db down'); }) },
      aiChatMessage: { findMany: vi.fn(async () => []) },
    } as never);
    const out = await broken.load({ userId: 'u1' });
    expect(out.topics).toEqual([]);
    expect(out.snippets).toEqual([]);
  });
});
