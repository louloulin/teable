/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatAuthService } from './ai-chat.auth.service';

function buildPrisma() {
  const now = new Date();
  return {
    aiChatSession: {
      create: vi.fn(async ({ data }: any) => ({ ...data, createdTime: now, updatedTime: now })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async ({ where, data: d }: any) => ({ ...d, ...where })),
      delete: vi.fn(async () => ({ id: 's' })),
    },
    aiChatMessage: {
      create: vi.fn(async ({ data }: any) => ({ ...data, createdTime: now })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async ({ where, data: d }: any) => ({ ...d, ...where })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
}

describe('AiChatAuthService (Stage 35)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let svc: AiChatAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AiChatAuthService(prisma as never);
  });

  it('creates a session with generated id', async () => {
    const out = await svc.createSession({
      model: 'MiniMax-M3',
      baseId: 'bse1',
      tableId: 'tbl1',
      createdBy: 'u',
    });
    expect(out.id).toMatch(/^aics_/);
    expect(out.model).toBe('MiniMax-M3');
    expect(out.baseId).toBe('bse1');
    expect(prisma.aiChatSession.create).toHaveBeenCalledTimes(1);
  });

  it('lists sessions filtered by baseId and createdBy', async () => {
    await svc.listSessions({ baseId: 'bse1', createdBy: 'u' });
    expect(prisma.aiChatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ baseId: 'bse1', createdBy: 'u' }),
      })
    );
  });

  it('addMessage touches session updatedTime', async () => {
    prisma.aiChatMessage.create.mockResolvedValueOnce({
      id: 'm1',
      sessionId: 's',
      role: 'user',
      content: 'hi',
      model: null,
      promptTokens: 1,
      completionTokens: 0,
      durationMs: 0,
      createdTime: new Date(),
    } as never);
    const out = await svc.addMessage({ sessionId: 's', role: 'user', content: 'hi' });
    expect(out.id).toBe('m1');
    expect(prisma.aiChatSession.update).toHaveBeenCalledWith({
      where: { id: 's' },
      data: { updatedTime: expect.any(Date) },
    });
  });

  it('deleteSession rejects unknown session', async () => {
    await expect(svc.deleteSession('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not expose another user session', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      createdBy: 'owner',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    await expect(svc.getSession('s', 'attacker')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not delete another user session', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      createdBy: 'owner',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    await expect(svc.deleteSession('s', 'attacker')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.aiChatSession.delete).not.toHaveBeenCalled();
  });

  it('chatTurn rejects when AI provider is missing', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'bse1',
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create.mockResolvedValueOnce({
      id: 'm',
      sessionId: 's',
      role: 'user',
      content: 'hi',
      model: null,
      promptTokens: 1,
      completionTokens: 0,
      durationMs: 0,
      createdTime: new Date(),
    } as never);
    await expect(svc.chatTurn({ sessionId: 's', userMessage: 'hi' })).rejects.toThrow(
      /AI provider is not configured/
    );
  });

  it('chatTurnStreaming yields deltas then a final done event', async () => {
    const ai = {
      generateTextStream: vi.fn(async function* () {
        yield { delta: 'Hello', done: false };
        yield { delta: ', ', done: false };
        yield { delta: 'world!', done: false };
        yield { delta: '', done: true, value: 'Hello, world!' };
      }),
    } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'bse1',
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create
      .mockResolvedValueOnce({
        id: 'u1',
        sessionId: 's',
        role: 'user',
        content: 'hi',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: 'a1',
        sessionId: 's',
        role: 'assistant',
        content: 'Hello, world!',
        model: 'MiniMax-M3',
        promptTokens: 5,
        completionTokens: 3,
        durationMs: 100,
        createdTime: new Date(),
      } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const chatSvc = new AiChatAuthService(prisma as never, ai);
    const chunks: unknown[] = [];
    for await (const c of chatSvc.chatTurnStreaming({ sessionId: 's', userMessage: 'hi' })) {
      chunks.push(c);
    }
    expect(chunks.length).toBe(4); // 3 deltas + 1 done
    expect(chunks[0]).toEqual({ delta: 'Hello', done: false });
    expect(chunks[2]).toEqual({ delta: 'world!', done: false });
    const final = chunks[3] as {
      done: boolean;
      assistantContent: string;
      assistantMessageId: string;
      userMessageId: string;
    };
    expect(final.done).toBe(true);
    expect(final.assistantContent).toBe('Hello, world!');
    expect(final.userMessageId).toBe('u1');
    expect(final.assistantMessageId).toBe('a1');
  });

  it('chatTurn persists user+assistant and returns assistant content', async () => {
    const ai = { generateText: vi.fn(async () => 'Hello back!') } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'bse1',
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create
      .mockResolvedValueOnce({
        id: 'u1',
        sessionId: 's',
        role: 'user',
        content: 'hi',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: 'a1',
        sessionId: 's',
        role: 'assistant',
        content: 'Hello back!',
        model: 'MiniMax-M3',
        promptTokens: 5,
        completionTokens: 3,
        durationMs: 100,
        createdTime: new Date(),
      } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const chatSvc = new AiChatAuthService(prisma as never, ai);
    const out = await chatSvc.chatTurn({ sessionId: 's', userMessage: 'hi' });
    expect(out.assistantContent).toBe('Hello back!');
    expect(out.userMessageId).toBe('u1');
    expect(out.assistantMessageId).toBe('a1');
    // Prompt contains the user message and the Assistant: tail
    const promptArg = ai.generateText.mock.calls[0][1].prompt;
    expect(promptArg).toContain('User: hi');
    expect(promptArg).toContain('Assistant:');
  });

  // ── Stage 37: table/view context injection ─────────────────────────

  it('chatTurn injects auto-resolved table context when session has tableId', async () => {
    const ai = { generateText: vi.fn(async () => 'Got it') } as never;
    const contextService = {
      resolve: vi.fn(async () => ({
        tableId: 'tblX',
        viewId: null,
        tableName: 'Tasks',
        fields: [{ id: 'fldTitle', name: 'Title', type: 'singleLineText' }],
        rows: [],
        rowCount: 0,
      })),
      render: vi.fn((ctx: any) =>
        ctx
          ? `Table: ${ctx.tableName} (${ctx.tableId})
Fields:
  - Title (singleLineText, id=fldTitle)`
          : ''
      ),
    } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'bse1',
      tableId: 'tblX',
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create
      .mockResolvedValueOnce({
        id: 'u1',
        sessionId: 's',
        role: 'user',
        content: 'hi',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: 'a1',
        sessionId: 's',
        role: 'assistant',
        content: 'Got it',
        model: 'MiniMax-M3',
        promptTokens: 5,
        completionTokens: 3,
        durationMs: 100,
        createdTime: new Date(),
      } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const chatSvc = new AiChatAuthService(prisma as never, ai, contextService);
    await chatSvc.chatTurn({ sessionId: 's', userMessage: 'summarize' });
    expect(contextService.resolve).toHaveBeenCalledWith({ tableId: 'tblX', viewId: null });
    const promptArg = ai.generateText.mock.calls[0][1].prompt;
    expect(promptArg).toContain('Context:');
    expect(promptArg).toContain('Table: Tasks (tblX)');
    expect(promptArg).toContain('Title (singleLineText, id=fldTitle)');
  });

  it('chatTurn prefers explicit caller-provided context over auto-resolved one', async () => {
    const ai = { generateText: vi.fn(async () => 'Ok') } as never;
    const contextService = {
      resolve: vi.fn(async () => null),
      render: vi.fn(() => ''),
    } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'bse1',
      tableId: 'tblX',
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create
      .mockResolvedValueOnce({
        id: 'u1',
        sessionId: 's',
        role: 'user',
        content: 'hi',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: 'a1',
        sessionId: 's',
        role: 'assistant',
        content: 'Ok',
        model: 'MiniMax-M3',
        promptTokens: 5,
        completionTokens: 3,
        durationMs: 100,
        createdTime: new Date(),
      } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const chatSvc = new AiChatAuthService(prisma as never, ai, contextService);
    await chatSvc.chatTurn({
      sessionId: 's',
      userMessage: 'translate',
      context: 'Manual hint from UI',
    });
    const promptArg = ai.generateText.mock.calls[0][1].prompt;
    expect(promptArg).toContain('Manual hint from UI');
    expect(contextService.resolve).not.toHaveBeenCalled();
  });

  it('chatTurn omits context when session has no tableId', async () => {
    const ai = { generateText: vi.fn(async () => 'Hi') } as never;
    const contextService = {
      resolve: vi.fn(async () => null),
      render: vi.fn(() => ''),
    } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create
      .mockResolvedValueOnce({
        id: 'u1',
        sessionId: 's',
        role: 'user',
        content: 'hi',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: 'a1',
        sessionId: 's',
        role: 'assistant',
        content: 'Hi',
        model: 'MiniMax-M3',
        promptTokens: 5,
        completionTokens: 3,
        durationMs: 100,
        createdTime: new Date(),
      } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const chatSvc = new AiChatAuthService(prisma as never, ai, contextService);
    await chatSvc.chatTurn({ sessionId: 's', userMessage: 'hi' });
    expect(contextService.resolve).not.toHaveBeenCalled();
    const promptArg = ai.generateText.mock.calls[0][1].prompt;
    expect(promptArg).not.toContain('Context:');
  });

  it('chatTurnStreaming injects auto-resolved context too', async () => {
    const ai = {
      generateTextStream: vi.fn(async function* () {
        yield { delta: 'Hello' };
        yield { delta: ' there' };
      }),
    } as never;
    const contextService = {
      resolve: vi.fn(async () => ({
        tableId: 'tblX',
        viewId: 'viw1',
        tableName: 'Tasks',
        fields: [{ id: 'fldTitle', name: 'Title', type: 'singleLineText' }],
        rows: [],
        rowCount: 0,
      })),
      render: vi.fn(() => 'Table: Tasks (tblX)'),
    } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'bse1',
      tableId: 'tblX',
      viewId: 'viw1',
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create
      .mockResolvedValueOnce({
        id: 'u1',
        sessionId: 's',
        role: 'user',
        content: 'hi',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: 'a1',
        sessionId: 's',
        role: 'assistant',
        content: 'Hello there',
        model: 'MiniMax-M3',
        promptTokens: 5,
        completionTokens: 3,
        durationMs: 100,
        createdTime: new Date(),
      } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const chatSvc = new AiChatAuthService(prisma as never, ai, contextService);
    const chunks: unknown[] = [];
    for await (const c of chatSvc.chatTurnStreaming({ sessionId: 's', userMessage: 'hi' })) {
      chunks.push(c);
    }
    expect(contextService.resolve).toHaveBeenCalledWith({ tableId: 'tblX', viewId: 'viw1' });
    const promptArg = ai.generateTextStream.mock.calls[0][1].prompt;
    expect(promptArg).toContain('Table: Tasks (tblX)');
  });

  // ── Stage 38: skill detection + skillName in result ──────────────

  it('chatTurn detects @skill prefix and injects skill system prompt', async () => {
    const ai = { generateText: vi.fn(async () => 'You are looking at Tasks.') } as never;
    const skillService = {
      listSkills: vi.fn(() => []),
      match: vi.fn(() => ({
        skill: { name: 'table', title: '@table', description: '', tags: [] },
        remainder: 'describe',
      })),
      buildPrompt: vi.fn(async () => "You are describing the user's current table."),
    } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'bse1',
      tableId: 'tblX',
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create
      .mockResolvedValueOnce({
        id: 'u1',
        sessionId: 's',
        role: 'user',
        content: '@table describe',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: 'a1',
        sessionId: 's',
        role: 'assistant',
        content: 'You are looking at Tasks.',
        model: 'MiniMax-M3',
        promptTokens: 5,
        completionTokens: 3,
        durationMs: 100,
        createdTime: new Date(),
      } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const chatSvc = new AiChatAuthService(prisma as never, ai, undefined, skillService);
    const out = await chatSvc.chatTurn({ sessionId: 's', userMessage: '@table describe' });
    expect(out.skillName).toBe('table');
    const promptArg = ai.generateText.mock.calls[0][1].prompt;
    expect(promptArg).toContain('Skill instructions:');
    expect(promptArg).toContain('describing the user');
    expect(promptArg).toContain('User: describe');
  });

  it('chatTurn returns no skillName when user message has no @prefix', async () => {
    const ai = { generateText: vi.fn(async () => 'Hi') } as never;
    const skillService = {
      listSkills: vi.fn(() => []),
      match: vi.fn(() => null),
      buildPrompt: vi.fn(async () => ''),
    } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create
      .mockResolvedValueOnce({
        id: 'u1',
        sessionId: 's',
        role: 'user',
        content: 'hi',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: 'a1',
        sessionId: 's',
        role: 'assistant',
        content: 'Hi',
        model: 'MiniMax-M3',
        promptTokens: 5,
        completionTokens: 3,
        durationMs: 100,
        createdTime: new Date(),
      } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const chatSvc = new AiChatAuthService(prisma as never, ai, undefined, skillService);
    const out = await chatSvc.chatTurn({ sessionId: 's', userMessage: 'hi' });
    expect(out.skillName).toBeUndefined();
    expect(skillService.match).toHaveBeenCalledWith('hi');
  });

  // ── Stage 39: memory injection into prompt ────────────────────────

  it('chatTurn loads + injects recent memory block into prompt', async () => {
    const ai = { generateText: vi.fn(async () => 'I recall our prior work.') } as never;
    const memoryService = {
      load: vi.fn(async () => ({
        topics: ['Q3 sales analysis', 'Duplicate filter'],
        snippets: ['user asked about revenue', 'asked to filter'],
        recentSessionCount: 2,
      })),
      render: vi.fn((m: any) =>
        m.topics.length > 0
          ? `Memory:\n  Recent topics: ${m.topics.join(' | ')}\n  Recent user messages:\n    - user asked about revenue`
          : ''
      ),
    } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'bse1',
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'usr_admin',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create
      .mockResolvedValueOnce({
        id: 'u1',
        sessionId: 's',
        role: 'user',
        content: 'continue from last time',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: 'a1',
        sessionId: 's',
        role: 'assistant',
        content: 'I recall our prior work.',
        model: 'MiniMax-M3',
        promptTokens: 5,
        completionTokens: 3,
        durationMs: 100,
        createdTime: new Date(),
      } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const chatSvc = new AiChatAuthService(prisma as never, ai, undefined, undefined, memoryService);
    await chatSvc.chatTurn({ sessionId: 's', userMessage: 'continue from last time' });
    expect(memoryService.load).toHaveBeenCalledWith({ userId: 'usr_admin', baseId: 'bse1' });
    const promptArg = ai.generateText.mock.calls[0][1].prompt;
    expect(promptArg).toContain('Q3 sales analysis | Duplicate filter');
    expect(promptArg).toContain('- user asked about revenue');
  });

  it('chatTurn omits memory block when memoryService returns empty', async () => {
    const ai = { generateText: vi.fn(async () => 'Hi') } as never;
    const memoryService = {
      load: vi.fn(async () => ({ topics: [], snippets: [], recentSessionCount: 0 })),
      render: vi.fn(() => ''),
    } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'usr_admin',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    prisma.aiChatMessage.create
      .mockResolvedValueOnce({
        id: 'u1',
        sessionId: 's',
        role: 'user',
        content: 'hi',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      } as never)
      .mockResolvedValueOnce({
        id: 'a1',
        sessionId: 's',
        role: 'assistant',
        content: 'Hi',
        model: 'MiniMax-M3',
        promptTokens: 5,
        completionTokens: 3,
        durationMs: 100,
        createdTime: new Date(),
      } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const chatSvc = new AiChatAuthService(prisma as never, ai, undefined, undefined, memoryService);
    await chatSvc.chatTurn({ sessionId: 's', userMessage: 'hi' });
    const promptArg = ai.generateText.mock.calls[0][1].prompt;
    expect(promptArg).not.toContain('Memory:');
  });

  // ── Stage 45: rename + fork ──────────────────────────────────────

  it('renameSession updates the title and returns the row', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'bse1',
      tableId: null,
      viewId: null,
      title: 'old',
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({
      id: 's',
      baseId: 'bse1',
      tableId: null,
      viewId: null,
      title: 'new',
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.renameSession({ sessionId: 's', title: 'new' });
    expect(out?.title).toBe('new');
    expect(prisma.aiChatSession.update).toHaveBeenCalledWith({
      where: { id: 's' },
      data: expect.objectContaining({ title: 'new' }),
    });
  });

  it('renameSession returns null when source missing', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce(null);
    const out = await svc.renameSession({ sessionId: 'missing', title: 'x' });
    expect(out).toBeNull();
  });

  it('renameSession trims and truncates long titles', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: null,
      tableId: null,
      viewId: null,
      title: 'old',
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({
      id: 's',
      baseId: null,
      tableId: null,
      viewId: null,
      title: '',
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const longTitle = 'x'.repeat(200);
    await svc.renameSession({ sessionId: 's', title: `   ${longTitle}   ` });
    const callArgs = prisma.aiChatSession.update.mock.calls[0][0];
    expect(callArgs.data.title).toHaveLength(120);
  });

  it('forkSession copies messages up to upToMessageIndex and tags as [Fork]', async () => {
    const messages = [
      {
        id: 'm1',
        sessionId: 'src',
        role: 'user',
        content: 'q1',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      },
      {
        id: 'm2',
        sessionId: 'src',
        role: 'assistant',
        content: 'a1',
        model: 'MiniMax-M3',
        promptTokens: 1,
        completionTokens: 1,
        durationMs: 1,
        createdTime: new Date(),
      },
      {
        id: 'm3',
        sessionId: 'src',
        role: 'user',
        content: 'q2',
        model: null,
        promptTokens: 1,
        completionTokens: 0,
        durationMs: 0,
        createdTime: new Date(),
      },
      {
        id: 'm4',
        sessionId: 'src',
        role: 'assistant',
        content: 'a2',
        model: 'MiniMax-M3',
        promptTokens: 1,
        completionTokens: 1,
        durationMs: 1,
        createdTime: new Date(),
      },
    ];
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 'src',
      baseId: 'bse1',
      tableId: 'tblX',
      viewId: null,
      title: 'Source',
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce(messages);
    prisma.aiChatSession.create.mockResolvedValueOnce({
      id: 'newId',
      baseId: 'bse1',
      tableId: 'tblX',
      viewId: null,
      title: '[Fork] Source',
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.create.mockResolvedValue({} as never);
    const out = await svc.forkSession({
      sourceSessionId: 'src',
      upToMessageIndex: 1,
      createdBy: 'u',
    });
    expect(out.newSessionId).toMatch(/^aics_/);
    expect(out.copiedMessages).toBe(2);
    expect(prisma.aiChatSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: '[Fork] Source' }),
      })
    );
    expect(prisma.aiChatMessage.create).toHaveBeenCalledTimes(2);
  });

  it('forkSession defaults to copying all messages', async () => {
    const messages = Array.from({ length: 3 }, (_, i) => ({
      id: `m${i}`,
      sessionId: 'src',
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'x',
      model: null,
      promptTokens: 1,
      completionTokens: 0,
      durationMs: 0,
      createdTime: new Date(),
    }));
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 'src',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'u',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce(messages);
    prisma.aiChatSession.create.mockResolvedValueOnce({} as never);
    prisma.aiChatMessage.create.mockResolvedValue({} as never);
    const out = await svc.forkSession({ sourceSessionId: 'src', createdBy: 'u' });
    expect(out.copiedMessages).toBe(3);
  });

  it('forkSession throws NotFoundException when source missing', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce(null);
    await expect(
      svc.forkSession({ sourceSessionId: 'missing', createdBy: 'u' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ── Stage 46: regenerateTurn ──────────────────────────────────────

  it('regenerateTurn deletes assistant messages after last user + reruns LLM', async () => {
    const ai = { generateText: vi.fn(async () => 'Second take.') } as never;
    const userMsg = {
      id: 'u1',
      sessionId: 's',
      role: 'user',
      content: 'hi',
      model: null,
      promptTokens: 1,
      completionTokens: 0,
      durationMs: 0,
      createdTime: new Date('2026-09-01T10:00:00Z'),
    };
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'usr_admin',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany
      .mockResolvedValueOnce([userMsg]) // messages desc, latest first
      .mockResolvedValueOnce([]); // history (before user)
    prisma.aiChatMessage.deleteMany.mockResolvedValueOnce({ count: 1 } as never);
    prisma.aiChatMessage.create.mockResolvedValueOnce({
      id: 'a_new',
      sessionId: 's',
      role: 'assistant',
      content: 'Second take.',
      model: 'MiniMax-M3',
      promptTokens: 5,
      completionTokens: 3,
      durationMs: 100,
      createdTime: new Date(),
    } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const svcWithAi = new AiChatAuthService(prisma as never, ai);
    const out = await svcWithAi.regenerateTurn({ sessionId: 's' });
    expect(out.assistantContent).toBe('Second take.');
    expect(out.userMessageId).toBe('u1');
    expect(out.assistantMessageId).toBe('a_new');
    expect(prisma.aiChatMessage.deleteMany).toHaveBeenCalled();
    expect(ai.generateText).toHaveBeenCalledTimes(1);
  });

  it('regenerateTurn throws when no user message exists', async () => {
    const ai = { generateText: vi.fn(async () => 'x') } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'usr_admin',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]);
    const svcWithAi = new AiChatAuthService(prisma as never, ai);
    await expect(svcWithAi.regenerateTurn({ sessionId: 's' })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('regenerateTurn throws when session missing', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce(null);
    await expect(svc.regenerateTurn({ sessionId: 'missing' })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  // ── Stage 47: editAndResubmit ──────────────────────────────────────

  it('editAndResubmit updates user message, deletes later messages, reruns LLM', async () => {
    const ai = { generateText: vi.fn(async () => 'Resubmitted answer.') } as never;
    const userMsg = {
      id: 'u1',
      sessionId: 's',
      role: 'user',
      content: 'original prompt',
      model: null,
      promptTokens: 1,
      completionTokens: 0,
      durationMs: 0,
      createdTime: new Date('2026-09-01T10:00:00Z'),
    };
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'usr_admin',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findUnique.mockResolvedValueOnce(userMsg);
    prisma.aiChatMessage.update.mockResolvedValueOnce({
      ...userMsg,
      content: 'edited prompt',
    } as never);
    prisma.aiChatMessage.deleteMany.mockResolvedValueOnce({ count: 2 } as never);
    prisma.aiChatMessage.findMany.mockResolvedValueOnce([]); // history before user
    prisma.aiChatMessage.create.mockResolvedValueOnce({
      id: 'a_resub',
      sessionId: 's',
      role: 'assistant',
      content: 'Resubmitted answer.',
      model: 'MiniMax-M3',
      promptTokens: 5,
      completionTokens: 3,
      durationMs: 100,
      createdTime: new Date(),
    } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({} as never);
    const svcWithAi = new AiChatAuthService(prisma as never, ai);
    const out = await svcWithAi.editAndResubmit({
      sessionId: 's',
      userMessageId: 'u1',
      newContent: '  edited prompt  ',
    });
    expect(out.assistantContent).toBe('Resubmitted answer.');
    expect(out.userMessageId).toBe('u1');
    expect(out.assistantMessageId).toBe('a_resub');
    // update should have been called with trimmed content
    expect(prisma.aiChatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' }, data: { content: 'edited prompt' } })
    );
    // later messages should have been deleted (createdTime > user)
    expect(prisma.aiChatMessage.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sessionId: 's' }),
      })
    );
    expect(ai.generateText).toHaveBeenCalledTimes(1);
  });

  it('editAndResubmit throws NotFoundException when user message not found', async () => {
    const ai = { generateText: vi.fn(async () => 'x') } as never;
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'usr_admin',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findUnique.mockResolvedValueOnce(null);
    const svcWithAi = new AiChatAuthService(prisma as never, ai);
    await expect(
      svcWithAi.editAndResubmit({ sessionId: 's', userMessageId: 'missing', newContent: 'x' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('editAndResubmit throws when target message is not a user message', async () => {
    const ai = { generateText: vi.fn(async () => 'x') } as never;
    const assistantMsg = {
      id: 'a0',
      sessionId: 's',
      role: 'assistant',
      content: 'hi',
      model: null,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: 0,
      createdTime: new Date('2026-09-01T10:00:00Z'),
    };
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: null,
      tableId: null,
      viewId: null,
      title: null,
      model: 'MiniMax-M3',
      createdBy: 'usr_admin',
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.aiChatMessage.findUnique.mockResolvedValueOnce(assistantMsg);
    const svcWithAi = new AiChatAuthService(prisma as never, ai);
    await expect(
      svcWithAi.editAndResubmit({ sessionId: 's', userMessageId: 'a0', newContent: 'x' })
    ).rejects.toThrow(/only user messages can be edited/);
    // Should not have invoked LLM nor deleted anything
    expect(ai.generateText).not.toHaveBeenCalled();
    expect(prisma.aiChatMessage.deleteMany).not.toHaveBeenCalled();
  });
});
