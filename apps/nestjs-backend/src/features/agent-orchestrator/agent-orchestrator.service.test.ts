import { AgentOrchestratorService } from './agent-orchestrator.service';

describe('AgentOrchestratorService', () => {
  it('passes the base context to a configured LLM client', async () => {
    const chat = vi.fn().mockResolvedValue({ text: 'configured reply' });
    const service = new AgentOrchestratorService(
      { chat },
      { route: vi.fn().mockResolvedValue({ system: 'system', tools: [] }) }
    );

    const reply = await service.handle('conversation-1', 'user-1', {
      user_id: 'user-1',
      text: 'hello',
      provider_meta: { baseId: 'base-1' },
    });

    expect(reply).toStrictEqual({ text: 'configured reply' });
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({ baseId: 'base-1', system: 'system' })
    );
  });

  it('reports provider failures instead of returning a fake reply', async () => {
    const service = new AgentOrchestratorService(
      { chat: vi.fn().mockRejectedValue(new Error('provider unavailable')) },
      { route: vi.fn().mockResolvedValue({ system: 'system', tools: [] }) }
    );

    await expect(
      service.handle('conversation-1', 'user-1', { user_id: 'user-1', text: 'hello' })
    ).rejects.toMatchObject({ status: 503 });
  });

  it('reports a missing provider instead of returning a fake reply', async () => {
    const service = new AgentOrchestratorService(undefined, {
      route: vi.fn().mockResolvedValue({ system: 'system', tools: [] }),
    });

    await expect(
      service.handle('conversation-1', 'user-1', { user_id: 'user-1', text: 'hello' })
    ).rejects.toMatchObject({ status: 503 });
  });

  it('executes an allowed tool with model arguments and records its result', async () => {
    const invoke = vi.fn().mockResolvedValue({ recordId: 'rec-1' });
    const chat = vi.fn().mockResolvedValue({
      text: 'created',
      requestedTools: [{ name: 'record_create', args: { name: 'Ada' } }],
    });
    const service = new AgentOrchestratorService(
      { chat },
      { route: vi.fn().mockResolvedValue({ system: 'system', tools: ['record_create'] }) }
    );
    service.registerTool({
      name: 'record_create',
      description: 'Create a record',
      parameters: { type: 'object' },
      invoke,
    });

    await expect(
      service.handle('conversation-1', 'user-1', { user_id: 'user-1', text: 'create Ada' })
    ).resolves.toStrictEqual({ text: 'created' });

    expect(invoke).toHaveBeenCalledWith(
      { name: 'Ada', __conversation_id__: 'conversation-1' },
      expect.objectContaining({ conversation_id: 'conversation-1' })
    );
    expect(service.inspect('conversation-1')?.messages.at(-2)?.content).toContain('rec-1');
  });

  it('resets a conversation without creating it during inspection', async () => {
    const service = new AgentOrchestratorService(
      { chat: vi.fn().mockResolvedValue({ text: 'ok' }) },
      { route: vi.fn().mockResolvedValue({ system: 'system', tools: [] }) }
    );

    expect(service.inspect('missing')).toBeUndefined();
    await service.handle('conversation-1', 'user-1', { user_id: 'user-1', text: 'hello' });
    expect(service.reset('conversation-1')).toBe(true);
    expect(service.inspect('conversation-1')).toBeUndefined();
    expect(service.reset('conversation-1')).toBe(false);
  });

  it('preloads live schema context when the router selects schema_query', async () => {
    const invoke = vi.fn().mockResolvedValue({ tables: [{ id: 'tbl-1', name: 'Contacts' }] });
    const chat = vi.fn().mockResolvedValue({ text: 'Contacts is available.' });
    const service = new AgentOrchestratorService(
      { chat },
      { route: vi.fn().mockResolvedValue({ system: 'system', tools: ['schema_query'] }) }
    );
    service.registerTool({
      name: 'schema_query',
      description: 'List schema',
      parameters: { type: 'object' },
      invoke,
    });

    await service.handle('conversation-1', 'user-1', {
      user_id: 'user-1',
      text: 'show tables',
      provider_meta: { baseId: 'base-1' },
    });

    expect(invoke).toHaveBeenCalledWith(
      { __conversation_id__: 'conversation-1' },
      expect.objectContaining({ base_id: 'base-1' })
    );
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ content: expect.stringContaining('Contacts') }),
        ]),
      })
    );
  });
  it('streams replies via the optional LLM stream() and persists the accumulated text', async () => {
    async function* stream() {
      yield 'hello ';
      yield 'world';
    }
    const service = new AgentOrchestratorService(
      { chat: vi.fn(), stream },
      { route: vi.fn().mockResolvedValue({ system: 'system', tools: [] }) }
    );

    const result = await service.handleStream('conversation-1', 'user-1', {
      user_id: 'user-1',
      text: 'hi',
    });

    expect(result.text).toBe('hello world');
    expect(result.deltas).toBe(2);
    const ctx = service.inspect('conversation-1');
    expect(ctx?.messages.map((m) => m.role)).toStrictEqual(['user', 'assistant']);
    expect(ctx?.messages[1].content).toBe('hello world');
  });

  it('falls back to chat() when the LLM has no stream() method', async () => {
    const chat = vi.fn().mockResolvedValue({ text: 'plain reply' });
    const service = new AgentOrchestratorService(
      { chat /* no stream */ },
      { route: vi.fn().mockResolvedValue({ system: 'system', tools: [] }) }
    );

    const result = await service.handleStream('conversation-1', 'user-1', {
      user_id: 'user-1',
      text: 'hi',
    });

    expect(result.text).toBe('plain reply');
    expect(result.deltas).toBe(1);
    expect(chat).toHaveBeenCalled();
  });

  it('lists conversations scoped to a user, newest-first', () => {
    const service = new AgentOrchestratorService(
      { chat: vi.fn() },
      { route: vi.fn().mockResolvedValue({ system: 'system', tools: [] }) }
    );

    service.handle('conv-a', 'user-1', { user_id: 'user-1', text: 'a' }).catch(() => undefined);
    service.handle('conv-b', 'user-1', { user_id: 'user-1', text: 'b' }).catch(() => undefined);
    service.handle('conv-c', 'user-2', { user_id: 'user-2', text: 'c' }).catch(() => undefined);

    const list = service.listConversations('user-1');
    expect(list.map((c) => c.conversationId).sort()).toStrictEqual(['conv-a', 'conv-b']);
    expect(list.every((c) => typeof c.updatedAt === 'number')).toBe(true);

    const other = service.listConversations('user-2');
    expect(other.map((c) => c.conversationId)).toStrictEqual(['conv-c']);

    const none = service.listConversations('user-3');
    expect(none).toStrictEqual([]);
  });
});
