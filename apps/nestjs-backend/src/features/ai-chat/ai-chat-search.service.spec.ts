/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatSearchService, MAX_SEARCH_RESULTS } from './ai-chat-search.service';

function buildPrisma(input: {
  sessions?: Array<{
    id: string;
    title: string | null;
    baseId: string | null;
    tableId: string | null;
    model: string;
    updatedTime: Date;
  }>;
  messages?: Array<{ sessionId: string; role: string; content: string }>;
}) {
  return {
    aiChatSession: {
      findMany: vi.fn(async () => input.sessions ?? []),
    },
    aiChatMessage: {
      findMany: vi.fn(async () => input.messages ?? []),
    },
  };
}

describe('AiChatSearchService (Stage 40)', () => {
  let svc: AiChatSearchService;

  beforeEach(() => {
    svc = new AiChatSearchService(buildPrisma({}) as never);
  });

  it('returns empty array for empty query', async () => {
    expect(await svc.search({ userId: 'u', query: '   ' })).toEqual([]);
  });

  it('returns empty array when no sessions exist', async () => {
    expect(await svc.search({ userId: 'u', query: 'sales' })).toEqual([]);
  });

  it('matches by title (highest score)', async () => {
    const recent = new Date();
    const prisma = buildPrisma({
      sessions: [
        { id: 's1', title: 'Sales Analysis Q3', baseId: 'bse1', tableId: null, model: 'M3', updatedTime: recent },
        { id: 's2', title: 'Unrelated Title', baseId: 'bse1', tableId: null, model: 'M3', updatedTime: recent },
      ],
      messages: [],
    });
    const s = new AiChatSearchService(prisma as never);
    const results = await s.search({ userId: 'u', query: 'sales' });
    expect(results.length).toBe(1);
    expect(results[0].sessionId).toBe('s1');
    expect(results[0].title).toBe('Sales Analysis Q3');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('ranks user-message hits above assistant-message hits', async () => {
    const recent = new Date();
    const old = new Date(Date.now() - 86400000 * 30);
    const prisma = buildPrisma({
      sessions: [
        { id: 'sA', title: 'Session A', baseId: 'b', tableId: null, model: 'M3', updatedTime: old },
        { id: 'sB', title: 'Session B', baseId: 'b', tableId: null, model: 'M3', updatedTime: old },
      ],
      messages: [
        { sessionId: 'sA', role: 'assistant', content: 'sales went up 20%' },
        { sessionId: 'sB', role: 'user', content: 'please summarize sales' },
      ],
    });
    const s = new AiChatSearchService(prisma as never);
    const results = await s.search({ userId: 'u', query: 'sales' });
    expect(results.length).toBe(2);
    expect(results[0].sessionId).toBe('sB');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('extracts a context snippet around the first match', async () => {
    const recent = new Date();
    const prisma = buildPrisma({
      sessions: [
        { id: 's1', title: 'Topic', baseId: 'b', tableId: null, model: 'M3', updatedTime: recent },
      ],
      messages: [
        { sessionId: 's1', role: 'user', content: 'I need to look at the quarter sales report and trends' },
      ],
    });
    const s = new AiChatSearchService(prisma as never);
    const results = await s.search({ userId: 'u', query: 'sales' });
    expect(results.length).toBe(1);
    expect(results[0].snippet).toBeDefined();
    expect(results[0].snippet!.toLowerCase()).toContain('sales');
  });

  it('applies a recency boost for sessions updated within 24h', async () => {
    const recent = new Date();
    const old = new Date(Date.now() - 86400000 * 30);
    const prisma = buildPrisma({
      sessions: [
        { id: 'recent', title: 'sales', baseId: 'b', tableId: null, model: 'M3', updatedTime: recent },
        { id: 'old', title: 'sales', baseId: 'b', tableId: null, model: 'M3', updatedTime: old },
      ],
      messages: [],
    });
    const s = new AiChatSearchService(prisma as never);
    const results = await s.search({ userId: 'u', query: 'sales' });
    expect(results[0].sessionId).toBe('recent');
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it('respects the take limit and the MAX_SEARCH_RESULTS cap', async () => {
    const prisma = buildPrisma({
      sessions: Array.from({ length: 100 }, (_, i) => ({
        id: `s${i}`, title: `sales ${i}`, baseId: 'b', tableId: null, model: 'M3', updatedTime: new Date(),
      })),
      messages: [],
    });
    const s = new AiChatSearchService(prisma as never);
    const results = await s.search({ userId: 'u', query: 'sales', take: 5 });
    expect(results.length).toBe(5);
    expect(MAX_SEARCH_RESULTS).toBe(50);
  });

  it('gracefully degrades on prisma error', async () => {
    const broken = new AiChatSearchService({
      aiChatSession: {
        findMany: vi.fn(async () => { throw new Error('db down'); }),
      },
      aiChatMessage: { findMany: vi.fn(async () => []) },
    } as never);
    const results = await broken.search({ userId: 'u', query: 'sales' });
    expect(results).toEqual([]);
  });
});
