/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { AiChatExportService } from './ai-chat-export.service';
import { AiChatCitationService } from './ai-chat-citation.service';

function buildPrisma(input: {
  session?: any;
  messages?: any[];
}) {
  return {
    aiChatSession: {
      findUnique: vi.fn(async () => input.session ?? null),
    },
    aiChatMessage: {
      findMany: vi.fn(async () => input.messages ?? []),
    },
  };
}

const session = {
  id: 's1',
  title: 'Sales analysis',
  baseId: 'bse1',
  tableId: 'tblX',
  viewId: null,
  model: 'MiniMax-M3',
  createdBy: 'u1',
  createdTime: new Date('2026-09-01T10:00:00Z'),
  updatedTime: new Date('2026-09-01T11:00:00Z'),
};

describe('AiChatExportService (Stage 41)', () => {
  let svc: AiChatExportService;
  let citations: AiChatCitationService;

  beforeEach(() => {
    citations = new AiChatCitationService();
    svc = new AiChatExportService(buildPrisma({ session, messages: [] }) as never, citations);
  });

  it('throws NotFound for unknown session', async () => {
    const empty = new AiChatExportService(buildPrisma({}) as never, citations);
    await expect(empty.exportMarkdown('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('exports markdown with metadata + empty messages', async () => {
    const md = await svc.exportMarkdown('s1');
    expect(md).toContain('# Chat: Sales analysis');
    expect(md).toContain('Base: `bse1`');
    expect(md).toContain('Table: `tblX`');
    expect(md).toContain('Model: `MiniMax-M3`');
    expect(md).toContain('Messages: 0');
  });

  it('exports markdown with message bodies', async () => {
    const prisma = buildPrisma({
      session,
      messages: [
        {
          id: 'm1', sessionId: 's1', role: 'user',
          content: 'analyze sales', model: null,
          promptTokens: 1, completionTokens: 0, durationMs: 0,
          createdTime: new Date('2026-09-01T10:05:00Z'),
        },
        {
          id: 'm2', sessionId: 's1', role: 'assistant',
          content: 'Sales went up 20%', model: 'MiniMax-M3',
          promptTokens: 5, completionTokens: 10, durationMs: 1000,
          createdTime: new Date('2026-09-01T10:05:30Z'),
        },
      ],
    });
    const s = new AiChatExportService(prisma as never, citations);
    const md = await s.exportMarkdown('s1');
    expect(md).toContain('## User');
    expect(md).toContain('analyze sales');
    expect(md).toContain('## Assistant');
    expect(md).toContain('Sales went up 20%');
    expect(md).toContain('Messages: 2');
  });

  it('includes timestamps only when requested', async () => {
    const prisma = buildPrisma({
      session,
      messages: [
        {
          id: 'm1', sessionId: 's1', role: 'user', content: 'q',
          model: null, promptTokens: 1, completionTokens: 0, durationMs: 0,
          createdTime: new Date('2026-09-01T10:05:00Z'),
        },
      ],
    });
    const s = new AiChatExportService(prisma as never, citations);
    const noTs = await s.exportMarkdown('s1');
    expect(noTs).not.toContain('2026-09-01T10:05:00.000Z');
    const withTs = await s.exportMarkdown('s1', { includeTimestamps: true });
    expect(withTs).toContain('2026-09-01T10:05:00.000Z');
  });

  it('exports JSON with full session + messages', async () => {
    const prisma = buildPrisma({
      session,
      messages: [
        {
          id: 'm1', sessionId: 's1', role: 'user', content: 'hi',
          model: null, promptTokens: 1, completionTokens: 0, durationMs: 0,
          createdTime: new Date('2026-09-01T10:05:00Z'),
        },
      ],
    });
    const s = new AiChatExportService(prisma as never, citations);
    const json = await s.exportJson('s1');
    const parsed = JSON.parse(json);
    expect(parsed.session.id).toBe('s1');
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0].role).toBe('user');
    expect(parsed.messages[0].content).toBe('hi');
    expect(parsed.exportedAt).toBeDefined();
  });

  it('export() dispatches to md by default and to json on request', async () => {
    const md = await svc.export('s1');
    expect(md.startsWith('# Chat:')).toBe(true);
    const json = await svc.export('s1', 'json');
    expect(JSON.parse(json).session.id).toBe('s1');
  });
});
