import { BadRequestException } from '@nestjs/common';
import type { AiStreamingService } from '../ai/ai-streaming.service';
import type { PermissionService } from '../auth/permission.service';
import type { AgentOrchestratorService } from './agent-orchestrator.service';
import { CuppyController } from './cuppy.controller';

describe('CuppyController', () => {
  // R-AI-7 — AiStreamingService has no side effects on the non-streaming paths
  // we test here. Build a no-op stub so the 4-arg constructor stays happy.
  const fakeStreaming = {} as unknown as AiStreamingService;

  it('uses the authenticated user and creates a conversation when omitted', async () => {
    const handle = vi.fn().mockResolvedValue({ text: '[echo] hello' });
    const controller = new CuppyController(
      { handle } as unknown as AgentOrchestratorService,
      { get: vi.fn().mockReturnValue('user-1') } as never,
      { validPermissions: vi.fn().mockResolvedValue([]) } as unknown as PermissionService,
      fakeStreaming
    );

    const result = await controller.chat({ message: 'hello' });

    expect(result.text).toBe('[echo] hello');
    expect(result.conversationId).toStrictEqual(expect.any(String));
    expect(handle).toHaveBeenCalledWith(
      result.conversationId,
      'user-1',
      expect.objectContaining({ user_id: 'user-1', text: 'hello' })
    );
  });

  it('preserves a supplied conversation id', async () => {
    const handle = vi.fn().mockResolvedValue({ text: 'ok' });
    const controller = new CuppyController(
      { handle } as unknown as AgentOrchestratorService,
      { get: vi.fn().mockReturnValue('user-1') } as never,
      { validPermissions: vi.fn().mockResolvedValue([]) } as unknown as PermissionService,
      fakeStreaming
    );

    await expect(
      controller.chat({ conversationId: 'conversation-1', message: 'hello' })
    ).resolves.toStrictEqual({ conversationId: 'conversation-1', text: 'ok' });
  });

  it('rejects requests without an authenticated user context', async () => {
    const controller = new CuppyController(
      { handle: vi.fn() } as unknown as AgentOrchestratorService,
      { get: vi.fn().mockReturnValue(undefined) } as never,
      { validPermissions: vi.fn() } as unknown as PermissionService,
      fakeStreaming
    );

    await expect(controller.chat({ message: 'hello' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('checks read access before using a supplied base', async () => {
    const handle = vi.fn().mockResolvedValue({ text: 'ok' });
    const validPermissions = vi.fn().mockResolvedValue([]);
    const cls = { get: vi.fn().mockReturnValueOnce('user-1').mockReturnValueOnce('token-1') };
    const controller = new CuppyController(
      { handle } as unknown as AgentOrchestratorService,
      cls as never,
      { validPermissions } as unknown as PermissionService,
      fakeStreaming
    );

    await controller.chat({ baseId: 'base-1', message: 'hello' });

    expect(validPermissions).toHaveBeenCalledWith('base-1', ['base|read'], 'token-1');
    expect(handle).toHaveBeenCalled();
  });

  it('does not call the LLM when the supplied base is inaccessible', async () => {
    const handle = vi.fn();
    const validPermissions = vi.fn().mockRejectedValue(new Error('forbidden'));
    const controller = new CuppyController(
      { handle } as unknown as AgentOrchestratorService,
      { get: vi.fn().mockReturnValue('user-1') } as never,
      { validPermissions } as unknown as PermissionService,
      fakeStreaming
    );

    await expect(controller.chat({ baseId: 'base-1', message: 'hello' })).rejects.toThrow(
      'forbidden'
    );
    expect(handle).not.toHaveBeenCalled();
  });
});


describe('CuppyController — R-AI-7 streaming + list', () => {
  const fakeStreaming = {
    prepareStreamResponse: vi.fn(),
    writeStreamEvent: vi.fn(),
  } as unknown as AiStreamingService;

  function build(orchestrator: Partial<AgentOrchestratorService>, cls: { get: (...a: unknown[]) => unknown }) {
    return new CuppyController(
      orchestrator as unknown as AgentOrchestratorService,
      cls as never,
      { validPermissions: vi.fn().mockResolvedValue([]) } as unknown as PermissionService,
      fakeStreaming
    );
  }

  it('lists conversations scoped to the current user', () => {
    const orchestrator = {
      listConversations: vi.fn().mockReturnValue([
        { conversationId: 'c1', baseId: 'b1', messageCount: 3, updatedAt: 200 },
        { conversationId: 'c2', messageCount: 0, updatedAt: 100 },
      ]),
    };
    const controller = build(orchestrator, { get: vi.fn().mockReturnValue('user-1') });
    const result = controller.listConversations();
    expect(orchestrator.listConversations).toHaveBeenCalledWith('user-1');
    expect(result).toStrictEqual({
      userId: 'user-1',
      conversations: [
        { conversationId: 'c1', baseId: 'b1', messageCount: 3, updatedAt: 200 },
        { conversationId: 'c2', messageCount: 0, updatedAt: 100 },
      ],
      count: 2,
    });
  });

  it('rejects listing when no user is in the CLS context', () => {
    const controller = build({ listConversations: vi.fn() }, { get: vi.fn().mockReturnValue(undefined) });
    expect(() => controller.listConversations()).toThrow(BadRequestException);
  });

  it('streams chat replies through the SSE helper', async () => {
    const orchestrator = {
      handleStream: vi.fn().mockResolvedValue({ text: 'hello-world', deltas: 3 }),
    };
    const controller = build(orchestrator, { get: vi.fn().mockReturnValue('user-1') });
    const req = { on: vi.fn() } as unknown as Parameters<typeof controller.chatStream>[1];
    const res = { end: vi.fn() } as unknown as Parameters<typeof controller.chatStream>[2];

    await controller.chatStream({ message: 'hi' }, req, res);

    expect(fakeStreaming.prepareStreamResponse).toHaveBeenCalledWith(res);
    expect(orchestrator.handleStream).toHaveBeenCalledWith(
      expect.any(String),
      'user-1',
      expect.objectContaining({ user_id: 'user-1', text: 'hi' }),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(fakeStreaming.writeStreamEvent).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ delta: 'hello-world', done: true })
    );
    expect((res as unknown as { end: ReturnType<typeof vi.fn> }).end).toHaveBeenCalled();
  });

  it('writes an error SSE event when the provider is unavailable', async () => {
    const orchestrator = {
      handleStream: vi.fn().mockRejectedValue(new Error('Cuppy AI provider is unavailable')),
    };
    const controller = build(orchestrator, { get: vi.fn().mockReturnValue('user-1') });
    const req = { on: vi.fn() } as unknown as Parameters<typeof controller.chatStream>[1];
    const res = { end: vi.fn() } as unknown as Parameters<typeof controller.chatStream>[2];

    await controller.chatStream({ message: 'hi' }, req, res);

    expect(fakeStreaming.writeStreamEvent).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ error: true, message: expect.stringContaining('unavailable') })
    );
    expect((res as unknown as { end: ReturnType<typeof vi.fn> }).end).toHaveBeenCalled();
  });
});
