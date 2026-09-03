/**
 * LLM provider adapter tests (R58).
 *
 * Covers: request normalisation, JSON body building, response parser,
 * SSE frame parser, chunk → streamed-response assembler, usage
 * accumulator, and full chat loop with a fake fetch.
 */
import { describe, expect, it } from 'vitest';
import {
  accumulateUsage,
  assembleStreamedResponse,
  buildChatRequestBody,
  ChatProviderError,
  createUsageAggregator,
  estimateTokens,
  MAX_MAX_TOKENS,
  normalizeChatRequest,
  parseChatResponseBody,
  parseSseFrame,
  parseSseStream,
} from './ai-chat-llm-provider';

describe('parseSseFrame', () => {
  it('parses a single complete frame', () => {
    const { frame, rest } = parseSseFrame('data: {"x":1}\n\ntail');
    expect(frame).toEqual({ kind: 'event', name: 'message', data: '{"x":1}' });
    expect(rest).toBe('tail');
  });
  it('detects [DONE] as terminator', () => {
    const { frame } = parseSseFrame('data: [DONE]\n\n');
    expect(frame).toEqual({ kind: 'done' });
  });
  it('captures event name + data fields', () => {
    const { frame } = parseSseFrame('event: foo\ndata: bar\n\n');
    expect(frame).toEqual({ kind: 'event', name: 'foo', data: 'bar' });
  });
  it('skips comments and empty lines (returns null + rest, caller retries)', () => {
    const first = parseSseFrame(': comment\n\ndata: hi\n\n');
    expect(first.frame).toBeNull();
    expect(first.rest).toBe('data: hi\n\n');
    const second = parseSseFrame(first.rest);
    expect(second.frame).toEqual({ kind: 'event', name: 'message', data: 'hi' });
  });
  it('returns null when no frame is complete yet', () => {
    const { frame, rest } = parseSseFrame('data: partial');
    expect(frame).toBeNull();
    expect(rest).toBe('data: partial');
  });
});

describe('parseSseStream', () => {
  it('decodes multiple frames from byte chunks', async () => {
    async function* bytes() {
      yield new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"He"},"finish_reason":null}]}\n\n');
      yield new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"llo"},"finish_reason":"stop"}]}\n\n');
      yield new TextEncoder().encode('data: [DONE]\n\n');
    }
    const out: Array<{ content?: string; finish: string | null }> = [];
    for await (const c of parseSseStream(bytes())) {
      const choice = c.choices[0];
      out.push({ content: choice.delta.content, finish: choice.finish_reason });
    }
    expect(out.length).toBe(2);
    expect(out[0]).toEqual({ content: 'He', finish: null });
    expect(out[1]).toEqual({ content: 'llo', finish: 'stop' });
  });
});

describe('normalizeChatRequest', () => {
  it('applies defaults', () => {
    const out = normalizeChatRequest(
      { model: '', messages: [{ role: 'user', content: 'hi' }] },
      { defaultModel: 'gpt-4o-mini', stream: false }
    );
    expect(out.model).toBe('gpt-4o-mini');
    expect(out.temperature).toBeCloseTo(0.2);
    expect(out.max_tokens).toBe(1024);
    expect(out.stream).toBe(false);
  });
  it('rejects empty messages', () => {
    expect(() =>
      normalizeChatRequest(
        { model: 'm', messages: [] },
        { defaultModel: 'm', stream: false }
      )
    ).toThrowError(/messages/);
  });
  it('rejects tool message without tool_call_id', () => {
    expect(() =>
      normalizeChatRequest(
        {
          model: 'm',
          messages: [{ role: 'tool', content: 'x' } as never],
        },
        { defaultModel: 'm', stream: false }
      )
    ).toThrowError(/tool_call_id/);
  });
  it('clamps oversized max_tokens', () => {
    const out = normalizeChatRequest(
      {
        model: 'm',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 999999,
      },
      { defaultModel: 'm', stream: false }
    );
    expect(out.max_tokens).toBe(MAX_MAX_TOKENS);
  });
});

describe('buildChatRequestBody', () => {
  it('omits tools when none are provided', () => {
    const body = buildChatRequestBody({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.5,
      top_p: 0.9,
      max_tokens: 256,
      stream: false,
      extra: {},
    });
    expect(body.tools).toBeUndefined();
    expect(body.stream).toBe(false);
  });
  it('includes tool_choice and tools when tools are provided', () => {
    const body = buildChatRequestBody({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'f', description: 'd', parameters: { type: 'object' } } }],
      tool_choice: 'auto',
      temperature: 0.1,
      top_p: 1,
      max_tokens: 100,
      stream: true,
      extra: {},
    });
    expect(body.tools).toBeDefined();
    expect(body.tool_choice).toBe('auto');
    expect(body.stream).toBe(true);
  });
});

describe('parseChatResponseBody', () => {
  it('parses a normal response', () => {
    const parsed = parseChatResponseBody({
      id: 'chatcmpl-1',
      model: 'gpt-4o',
      created: 1700000000,
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: { role: 'assistant', content: 'Hello world' },
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    expect(parsed.id).toBe('chatcmpl-1');
    expect(parsed.choices[0].message.content).toBe('Hello world');
    expect(parsed.usage?.total_tokens).toBe(15);
  });
  it('parses tool_calls payload', () => {
    const parsed = parseChatResponseBody({
      id: '1',
      model: 'm',
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
                function: { name: 'schema_query', arguments: '{"tableId":"tbl_1"}' },
              },
            ],
          },
        },
      ],
    });
    expect(parsed.choices[0].message.tool_calls?.[0].name).toBe('schema_query');
    expect(parsed.choices[0].message.tool_calls?.[0].arguments).toBe('{"tableId":"tbl_1"}');
  });
  it('rejects response with no choices', () => {
    expect(() => parseChatResponseBody({ id: 'x', model: 'm', created: 0, choices: [] })).toThrowError(/choices/);
  });
});

describe('assembleStreamedResponse', () => {
  it('reassembles a streamed reply', () => {
    const chunks = [
      {
        id: '1',
        model: 'm',
        created: 0,
        choices: [{ index: 0, delta: { role: 'assistant' as const, content: 'He' }, finish_reason: null }],
      },
      {
        id: '1',
        model: 'm',
        created: 0,
        choices: [{ index: 0, delta: { content: 'llo' }, finish_reason: null }],
      },
      {
        id: '1',
        model: 'm',
        created: 0,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ];
    const assembled = assembleStreamedResponse(chunks, { model: 'm' });
    expect(assembled.choices[0].message.content).toBe('Hello');
    expect(assembled.choices[0].finish_reason).toBe('stop');
  });
  it('reassembles streamed tool calls', () => {
    const chunks = [
      {
        id: '1',
        model: 'm',
        created: 0,
        choices: [
          {
            index: 0,
            delta: {
              role: 'assistant' as const,
              tool_calls: [{ index: 0, id: 'tc_1', name: 'record_query', arguments: '{"tableId":' }],
            },
            finish_reason: null,
          },
        ],
      },
      {
        id: '1',
        model: 'm',
        created: 0,
        choices: [
          {
            index: 0,
            delta: { tool_calls: [{ index: 0, arguments: '"tbl_1","take":10}' }] },
            finish_reason: 'tool_calls',
          },
        ],
      },
    ];
    const assembled = assembleStreamedResponse(chunks, { model: 'm' });
    const tc = assembled.choices[0].message.tool_calls?.[0];
    expect(tc?.name).toBe('record_query');
    expect(tc?.arguments).toContain('"take":10');
  });
});

describe('usage accumulator', () => {
  it('sums usage across chunks', () => {
    const acc = createUsageAggregator();
    accumulateUsage(acc, {
      id: '1',
      model: 'm',
      created: 0,
      choices: [{ index: 0, delta: {}, finish_reason: null }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    accumulateUsage(acc, {
      id: '1',
      model: 'm',
      created: 0,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
    });
    expect(acc.prompt_tokens).toBe(15);
    expect(acc.completion_tokens).toBe(8);
    expect(acc.total_tokens).toBe(23);
    expect(acc.chunks).toBe(2);
  });
  it('handles missing usage gracefully', () => {
    const acc = createUsageAggregator();
    accumulateUsage(acc, {
      id: '1',
      model: 'm',
      created: 0,
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    });
    expect(acc.chunks).toBe(1);
    expect(acc.total_tokens).toBe(0);
  });
});

describe('estimateTokens', () => {
  it('estimates by chars/4', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });
});
