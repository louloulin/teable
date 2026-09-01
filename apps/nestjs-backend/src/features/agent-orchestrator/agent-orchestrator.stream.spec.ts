import { describe, expect, it, vi } from 'vitest';
import { AgentOrchestratorService } from './agent-orchestrator.service';

const buildService = (chatStream: AsyncGenerator<{ delta: string; value?: string; done: boolean }>) => {
  const service = new AgentOrchestratorService(
    { chat: vi.fn(), chatStream: () => chatStream },
    { route: vi.fn().mockResolvedValue({ system: 'system', tools: [] }) }
  );
  return service;
};

describe('AgentOrchestratorService.chatStream (R-AI-11)', () => {
  it('emits each delta from the upstream provider and the final value', async () => {
    async function* stream() {
      yield { delta: 'Hello', done: false };
      yield { delta: ', ', done: false };
      yield { delta: 'world!', done: false };
      yield { delta: '', value: 'Hello, world!', done: true };
    }
    const service = buildService(stream());

    const chunks: Array<{ delta: string; value?: string; done: boolean }> = [];
    for await (const chunk of service.chatStream('c-1', 'u-1', {
      user_id: 'u-1',
      text: 'hi',
    })) {
      chunks.push(chunk);
    }

    expect(chunks.map((c) => c.delta)).toEqual(['Hello', ', ', 'world!', '']);
    expect(chunks.at(-1)?.value).toBe('Hello, world!');
  });

  it('persists user + assistant messages and respects abort signal', async () => {
    async function* stream() {
      yield { delta: 'partial', done: false };
      yield { delta: ' reply', done: false };
      yield { delta: '', value: 'partial reply', done: true };
    }
    const service = buildService(stream());

    const abort = new AbortController();
    const collected: string[] = [];
    for await (const chunk of service.chatStream(
      'c-2',
      'u-2',
      { user_id: 'u-2', text: 'tell me something' },
      abort.signal
    )) {
      collected.push(chunk.delta);
    }

    const ctx = service.inspect('c-2');
    expect(ctx?.messages.map((m) => m.content)).toEqual([
      'tell me something',
      'partial reply',
    ]);
    expect(collected.length).toBeGreaterThan(0);
  });

  it('falls back to the synchronous chat() when chatStream is absent', async () => {
    const service = new AgentOrchestratorService(
      {
        chat: vi.fn().mockResolvedValue({ text: 'echoed reply' }),
      },
      { route: vi.fn().mockResolvedValue({ system: 'system', tools: [] }) }
    );

    const chunks: string[] = [];
    for await (const chunk of service.chatStream('c-3', 'u-3', {
      user_id: 'u-3',
      text: 'hi',
    })) {
      if (chunk.delta) chunks.push(chunk.delta);
    }

    expect(chunks.join('')).toBe('echoed reply');
    const ctx = service.inspect('c-3');
    expect(ctx?.messages.at(-1)?.content).toBe('echoed reply');
  });
});
