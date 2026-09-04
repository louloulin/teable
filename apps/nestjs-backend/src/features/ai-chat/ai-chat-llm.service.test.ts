/**
 * AiChatLlmService tests (R59).
 *
 * Covers: provider config resolution (gateway / env / null), tool
 * descriptor → JSON Schema conversion, fake-upstream e2e via the
 * adapter, and executeTool delegation to AiChatToolsService.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatLlmService } from './ai-chat-llm.service';
import { AiModelResolverService } from '../ai/ai-model-resolver.service';
import type { AiChatToolsService } from './ai-chat-tools.service';
import { DEFAULT_AI_SETTING } from '../ai-setting/ai-setting.types';
import { AI_CHAT_TOOLS, TOOL_GET_RECORDS, TOOL_LIST_TABLES } from './ai-chat-tools.service';

const baseSettings = () => ({
  ...DEFAULT_AI_SETTING,
  updatedAt: new Date(0).toISOString(),
});

const buildToolsMock = (): Pick<AiChatToolsService, 'invoke'> => ({
  invoke: vi.fn(async (name: string, _args: Record<string, unknown>) => ({
    toolName: name,
    ok: true,
    markdown: `mock result for ${name}`,
    rows: 1,
  })),
});

/**
 * Build a stub AiModelResolverService for unit tests. The real resolver
 * returns a config with provider/model/baseUrl — the LLM service only
 * reads `config.model`, so we stub the minimum needed surface.
 */
const buildResolverMock = (): Pick<AiModelResolverService, 'resolve'> => ({
  resolve: vi.fn().mockReturnValue({
    source: 'matrix' as const,
    config: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      contextWindow: 128_000,
      supportsTools: true,
      supportsVision: true,
    },
  }) as unknown as AiModelResolverService['resolve'],
});

describe('AiChatLlmService.resolveProviderConfig', () => {
  const prevEnv = { ...process.env };
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_DEFAULT_MODEL;
  });

  it('returns null when nothing is configured', () => {
    const svc = new AiChatLlmService(buildToolsMock() as never, buildResolverMock() as never);
    expect(svc.resolveProviderConfig(baseSettings())).toBeNull();
  });

  it('returns config from the admin AI Gateway', () => {
    const svc = new AiChatLlmService(buildToolsMock() as never, buildResolverMock() as never);
    const out = svc.resolveProviderConfig({
      ...baseSettings(),
      aiGatewayApiKey: 'sk-gw',
      aiGatewayBaseUrl: 'https://gw.example/v1',
      defaultModel: 'gpt-4o',
    });
    expect(out?.config.apiKey).toBe('sk-gw');
    expect(out?.config.baseUrl).toBe('https://gw.example/v1');
    expect(out?.model).toBe('gpt-4o');
  });

  it('falls back to env when gateway is empty', () => {
    process.env.OPENAI_API_KEY = 'sk-env';
    process.env.OPENAI_BASE_URL = 'https://env.example/v1';
    const svc = new AiChatLlmService(buildToolsMock() as never, buildResolverMock() as never);
    const out = svc.resolveProviderConfig(baseSettings());
    expect(out?.config.apiKey).toBe('sk-env');
    expect(out?.config.baseUrl).toBe('https://env.example/v1');
    expect(out?.model).toBe('gpt-4o-mini');
  });

  it('refuses when setting is disabled', () => {
    const svc = new AiChatLlmService(buildToolsMock() as never, buildResolverMock() as never);
    const out = svc.resolveProviderConfig({
      ...baseSettings(),
      enabled: false,
      aiGatewayApiKey: 'sk-gw',
      aiGatewayBaseUrl: 'https://gw.example/v1',
    });
    expect(out).toBeNull();
  });
});

describe('AiChatLlmService.toInternalDescriptors', () => {
  it('converts AI_CHAT_TOOLS to OpenAI JSON Schema', () => {
    const svc = new AiChatLlmService(buildToolsMock() as never, buildResolverMock() as never);
    const out = svc.toInternalDescriptors();
    expect(out.length).toBe(AI_CHAT_TOOLS.length);
    const listTables = out.find((d) => d.name === TOOL_LIST_TABLES);
    expect(listTables?.parameters).toEqual({
      type: 'object',
      properties: { baseId: { type: 'string', description: 'Base id' } },
      required: ['baseId'],
      additionalProperties: false,
    });
  });
  it('preserves tool descriptions', () => {
    const svc = new AiChatLlmService(buildToolsMock() as never, buildResolverMock() as never);
    const out = svc.toInternalDescriptors();
    const getRecords = out.find((d) => d.name === TOOL_GET_RECORDS);
    expect(getRecords?.description).toMatch(/Fetch/);
  });
});

describe('AiChatLlmService.run — e2e with fake upstream', () => {
  vi.setConfig({ testTimeout: 15000 });
  it('runs the tool loop and returns final reply + usage', async () => {
    // Default 5000ms is too tight for the tool loop + fake upstream.
    const toolsMock = buildToolsMock();
    let calls = 0;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      calls++;
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            id: 'cmpl-1',
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
                      function: { name: TOOL_LIST_TABLES, arguments: '{"baseId":"b1"}' },
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
      return new Response(
        JSON.stringify({
          id: 'cmpl-2',
          model: 'm',
          created: 0,
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: { role: 'assistant', content: 'Found your tables' },
            },
          ],
          usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }) as unknown as typeof fetch;
    const svc = new AiChatLlmService(toolsMock as never, buildResolverMock() as never);
    const out = await svc.run(
      {
        system: 'You are helpful',
        messages: [{ role: 'user', content: 'show tables' }],
        baseId: 'b1',
      },
      {
        ...baseSettings(),
        aiGatewayApiKey: 'sk-test',
        aiGatewayBaseUrl: 'https://fake.local/v1',
      },
      fetchImpl
    );
    expect(out.configured).toBe(true);
    expect(out.text).toBe('Found your tables');
    expect(out.toolCalls.length).toBe(1);
    expect(out.toolCalls[0].name).toBe(TOOL_LIST_TABLES);
    expect(out.toolCalls[0].args).toEqual({ baseId: 'b1' });
    expect(out.usage.total_tokens).toBe(31);
    expect(out.steps).toBe(2);
    expect(out.provider?.baseUrl).toBe('https://fake.local/v1');
    expect(toolsMock.invoke).toHaveBeenCalledWith(TOOL_LIST_TABLES, { baseId: 'b1' });
  });

  it('returns configured=false when no provider is available', async () => {
    const toolsMock = buildToolsMock();
    const svc = new AiChatLlmService(toolsMock as never, buildResolverMock() as never);
    const out = await svc.run(
      {
        system: '',
        messages: [{ role: 'user', content: 'hi' }],
      },
      baseSettings(),
      (async () => undefined) as unknown as typeof fetch
    );
    expect(out.configured).toBe(false);
    expect(out.text).toBe('');
    expect(out.toolCalls.length).toBe(0);
    expect(out.provider).toBeNull();
  });
});
