/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AiChatUsageService,
  DEFAULT_DAILY_DAYS,
  MAX_DAILY_DAYS,
} from './ai-chat-usage.service';

function buildPrisma(input: {
  sessions?: any[];
  messageCount?: number;
  messageAgg?: any;
  messages?: any[];
}) {
  return {
    aiChatSession: {
      findMany: vi.fn(async () => input.sessions ?? []),
    },
    aiChatMessage: {
      count: vi.fn(async () => input.messageCount ?? 0),
      aggregate: vi.fn(async () => input.messageAgg ?? { _sum: { promptTokens: 0, completionTokens: 0, durationMs: 0 } }),
      findMany: vi.fn(async () => input.messages ?? []),
    },
  };
}

describe('AiChatUsageService (Stage 44)', () => {
  let svc: AiChatUsageService;

  beforeEach(() => {
    svc = new AiChatUsageService(buildPrisma({}) as never);
  });

  it('summary returns zeroed totals when userId is empty', async () => {
    const out = await svc.summary('');
    expect(out.totalSessions).toBe(0);
    expect(out.totalMessages).toBe(0);
    expect(out.totalPromptTokens).toBe(0);
    expect(out.firstSessionAt).toBeNull();
  });

  it('summary aggregates tokens + duration + model counts', async () => {
    const prisma = buildPrisma({
      sessions: [
        { createdTime: new Date('2026-09-01T10:00:00Z'), model: 'MiniMax-M3' },
        { createdTime: new Date('2026-09-02T10:00:00Z'), model: 'MiniMax-M3' },
        { createdTime: new Date('2026-09-03T10:00:00Z'), model: 'gpt-4' },
      ],
      messageCount: 12,
      messageAgg: {
        _sum: { promptTokens: 1000, completionTokens: 800, durationMs: 60000 },
      },
    });
    const s = new AiChatUsageService(prisma as never);
    const out = await s.summary('u1');
    expect(out.totalSessions).toBe(3);
    expect(out.totalMessages).toBe(12);
    expect(out.totalPromptTokens).toBe(1000);
    expect(out.totalCompletionTokens).toBe(800);
    expect(out.totalDurationMs).toBe(60000);
    expect(out.modelCounts.length).toBe(2);
    expect(out.modelCounts[0].model).toBe('MiniMax-M3');
    expect(out.modelCounts[0].count).toBe(2);
    expect(out.firstSessionAt).toEqual(new Date('2026-09-01T10:00:00Z'));
    expect(out.lastSessionAt).toEqual(new Date('2026-09-03T10:00:00Z'));
  });

  it('summary degrades gracefully on prisma error', async () => {
    const broken = new AiChatUsageService({
      aiChatSession: { findMany: vi.fn(async () => { throw new Error('db down'); }) },
      aiChatMessage: { count: vi.fn(async () => 0), aggregate: vi.fn(async () => ({ _sum: {} })), findMany: vi.fn(async () => []) },
    } as never);
    const out = await broken.summary('u1');
    expect(out.totalSessions).toBe(0);
  });

  it('daily returns N consecutive days with zero-filled gaps', async () => {
    const prisma = buildPrisma({
      sessions: [],
      messages: [],
    });
    const s = new AiChatUsageService(prisma as never);
    const out = await s.daily({ userId: 'u1', days: 3 });
    expect(out.length).toBe(3);
    expect(out[0].date).toBeDefined();
    expect(out.every((d) => d.sessions === 0 && d.messages === 0)).toBe(true);
  });

  it('daily buckets sessions + messages by UTC day', async () => {
    const today = new Date();
    today.setUTCHours(10, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const prisma = buildPrisma({
      sessions: [
        { id: 's1', createdTime: today },
        { id: 's2', createdTime: yesterday },
      ],
      messages: [
        { sessionId: 's1', promptTokens: 50, completionTokens: 30, createdTime: today },
        { sessionId: 's2', promptTokens: 70, completionTokens: 40, createdTime: yesterday },
        { sessionId: 's2', promptTokens: 90, completionTokens: 60, createdTime: yesterday },
      ],
    });
    const s = new AiChatUsageService(prisma as never);
    const out = await s.daily({ userId: 'u1', days: 2 });
    expect(out.length).toBe(2);
    const bucketsByDate = new Map(out.map((b) => [b.date, b]));
    expect(bucketsByDate.get(ymd(today))?.sessions).toBe(1);
    expect(bucketsByDate.get(ymd(today))?.messages).toBe(1);
    expect(bucketsByDate.get(ymd(yesterday))?.messages).toBe(2);
  });

  it('daily respects MAX_DAILY_DAYS cap', () => {
    expect(MAX_DAILY_DAYS).toBe(90);
    expect(DEFAULT_DAILY_DAYS).toBe(7);
  });

  it('daily returns empty array on prisma error', async () => {
    const broken = new AiChatUsageService({
      aiChatSession: { findMany: vi.fn(async () => { throw new Error('db down'); }) },
      aiChatMessage: { count: vi.fn(async () => 0), aggregate: vi.fn(async () => ({ _sum: {} })), findMany: vi.fn(async () => { throw new Error('db down'); }) },
    } as never);
    const out = await broken.daily({ userId: 'u1' });
    expect(out).toEqual([]);
  });
});

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
