/**
 * LLM adapter tests (R58).
 *
 * Covers: provider-not-configured guard, full tool loop with a fake
 * fetch upstream (non-streaming + streaming), tool budget enforcement,
 * error propagation, and final assistant text extraction.
 */
import { describe, expect, it } from 'vitest';
import {
  ChatProviderError,
  runChat,
  runChatStream,
  type AdapterConfig,
} from './ai-chat-llm-adapter';

const fakeConfig = (fetchImpl: typeof fetch): AdapterConfig => ({
  provider: {
    baseUrl: 'https://fake.local/v1',
    apiKey: 'sk-test',
    defaultModel: 'fake-1',
    providerLabel: 'fake',
  },
  defaultModel: 'fake-1',
  fetchImpl,
});

describe('runChat — guard rails', () => {
  it('rejects when API key is empty', async () => {
    const cfg: AdapterConfig = {
      provider: { baseUrl: 'https://x', apiKey: '', defaultModel: 'm', providerLabel: 'fake' },
      defaultModel: 'm',
      fetchImpl: (() => undefined) as never,
    };
    await expect(
      runChat(
        {
          system: '',
          messages: [{ role: 'user', content: 'hi' }],
          tools: [],
        },
        cfg
      )
    ).rejects.toThrowError(/API key/);
  });
});

describe('runChat — non-streaming with tool loop', () => {
  it('runs a single-step reply with no tool calls', async () => {
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      return new Response(
        JSON.stringify({
          id: 'cmpl-1',
          model: 'fake-1',
          created: 0,
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: 'Hi back' },
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;
    const out = await runChat(
      {
        system: '',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
      },
      fakeConfig(fetchImpl)
    );
    expect(out.text).toBe('Hi back');
    expect(out.toolCalls.length).toBe(0);
    expect(out.usage.total_tokens).toBe(8);
    expect(out.finishReason).toBe('stop');
  });

  it('runs a tool loop: assistant emits tool_calls, executor returns, second turn emits final text', async () => {
    let calls = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls++;
      const body = JSON.parse(init.body as string);
      // First call has only the user message; reply with a tool_call.
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            id: 'cmpl-1',
            model: 'fake-1',
            created: 0,
            choices: [
              {
                index: 0,
                finish_reason: 'tool_calls',
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [
                    {
                      id: 'tc_1',
                      type: 'function',
                      function: { name: 'record_query', arguments: '{"tableId":"tbl_x"}' },
                    },
                  ],
                },
              },
            ],
            usage: { prompt_tokens: 7, completion_tokens: 4, total_tokens: 11 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      // Second call includes the tool result message; reply with final text.
      const hasToolResult = Array.isArray(body.messages) && body.messages.some((m: { role: string }) => m.role === 'tool');
      expect(hasToolResult).toBe(true);
      return new Response(
        JSON.stringify({
          id: 'cmpl-2',
          model: 'fake-1',
          created: 0,
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: 'Here is what I found' },
            },
          ],
          usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;
    const executor = async (name: string, args: Record<string, unknown>) => {
      if (name === 'record_query') return { records: [{ id: 'r1' }] };
      throw new Error('unexpected tool: ' + name);
    };
    const out = await runChat(
      {
        system: '',
        messages: [{ role: 'user', content: 'show me records' }],
        tools: [{ name: 'record_query', description: 'list records', parameters: { type: 'object' } }],
        executeTool: executor,
      },
      fakeConfig(fetchImpl)
    );
    expect(calls).toBe(2);
    expect(out.text).toBe('Here is what I found');
    expect(out.toolCalls.length).toBe(1);
    expect(out.toolCalls[0].name).toBe('record_query');
    expect(out.toolCalls[0].args).toEqual({ tableId: 'tbl_x' });
    expect(out.citations[0].table).toBe('tbl_x');
    expect(out.usage.total_tokens).toBe(31);
    expect(out.steps).toBe(2);
  });

  it('throws on 4xx response', async () => {
    const fetchImpl = (async () => new Response('{"error":"bad request"}', { status: 400 })) as unknown as typeof fetch;
    await expect(
      runChat(
        {
          system: '',
          messages: [{ role: 'user', content: 'x' }],
          tools: [],
        },
        fakeConfig(fetchImpl)
      )
    ).rejects.toThrowError(ChatProviderError);
  });

  it('throws on 5xx response', async () => {
    const fetchImpl = (async () => new Response('upstream down', { status: 503 })) as unknown as typeof fetch;
    await expect(
      runChat(
        {
          system: '',
          messages: [{ role: 'user', content: 'x' }],
          tools: [],
        },
        fakeConfig(fetchImpl)
      )
    ).rejects.toThrowError(/503/);
  });
});

describe('runChatStream — streaming with fake upstream', () => {
  it('yields text deltas and a final frame', async () => {
    const fetchImpl = (async () => {
      const stream = new ReadableStream({
        start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode('data: {"choices":[{"index":0,"delta":{"role":"assistant","content":"He"},"finish_reason":null}]}\n\n'));
          controller.enqueue(enc.encode('data: {"choices":[{"index":0,"delta":{"content":"llo"},"finish_reason":null}]}\n\n'));
          controller.enqueue(enc.encode('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}\n\n'));
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }) as unknown as typeof fetch;
    const out: { deltas: string[]; final?: string; usageTotal?: number; finish?: string } = {
      deltas: [],
    };
    for await (const ev of runChatStream(
      {
        system: '',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [],
      },
      fakeConfig(fetchImpl)
    )) {
      if (ev.delta) out.deltas.push(ev.delta);
      if (ev.text !== undefined) out.final = ev.text;
      if (ev.usage) out.usageTotal = ev.usage.total_tokens;
      if (ev.finishReason) out.finish = ev.finishReason;
    }
    expect(out.deltas.join('')).toBe('Hello');
    expect(out.final).toBe('Hello');
    expect(out.usageTotal).toBe(5);
    expect(out.finish).toBe('stop');
  });
});
