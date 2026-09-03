/**
 * AI Chat LLM service (R59).
 *
 * Wires the R58 OpenAI-compatible adapter into the ai-chat module:
 *   - resolves provider config from the AI Settings Admin Gateway
 *     (or env OPENAI_* fallback)
 *   - converts AI_CHAT_TOOLS descriptors into OpenAI function-calling
 *     format via the tool-bridge
 *   - executes tool calls by delegating to AiChatToolsService.invoke
 *   - records per-call token usage + tool-call count into the
 *     ai-chat-usage ledger when one is configured
 *
 * Pure (no Prisma / fetch — those live in AiChatToolsService and the
 * adapter). All Prisma writes happen at the call sites (chatTurn /
 * chatTurnStreaming) so this service stays composable.
 */

import { Injectable, Logger } from '@nestjs/common';
import { AI_CHAT_TOOLS, type IAiChatToolDescriptor, AiChatToolsService } from './ai-chat-tools.service';
import { DEFAULT_AI_SETTING, type IAiSetting } from '../ai-setting/ai-setting.types';
import {
  runChat,
  runChatStream,
  ChatProviderError,
  type AdapterConfig,
  type AdapterRunResult,
} from './ai-chat-llm-adapter';
import {
  type InternalToolDescriptor,
  type ParsedToolCall,
  type ToolLoopBudget,
} from './ai-chat-tool-bridge';
import type { ChatMessage, ChatProviderConfig } from './ai-chat-llm-provider';

export type AiChatLlmRunArgs = {
  system: string;
  messages: ChatMessage[];
  baseId?: string;
  budget?: ToolLoopBudget;
  temperature?: number;
  max_tokens?: number;
  signal?: AbortSignal;
  /** Optional fetch override for tests; production uses global fetch. */
  fetchImpl?: typeof fetch;
};

export type AiChatLlmRunResult = AdapterRunResult & {
  /** Provider config that was used (for diagnostics + audit). */
  provider: { label: string | undefined; baseUrl: string; model: string } | null;
  /** Empty when no provider is configured. */
  configured: boolean;
};

const PROVIDER_TIMEOUT_MS = 30_000;

@Injectable()
export class AiChatLlmService {
  private readonly logger = new Logger(AiChatLlmService.name);

  constructor(private readonly tools: AiChatToolsService) {}

  /**
   * Resolve provider config from the Admin AI Gateway. Returns null
   * when no provider is configured — callers should fall back to
   * the built-in echo so the UI stays responsive.
   */
  resolveProviderConfig(setting: IAiSetting | null | undefined): {
    config: ChatProviderConfig;
    model: string;
  } | null {
    const s = setting ?? DEFAULT_AI_SETTING;
    if (!s.enabled) return null;
    const baseUrl = (s.aiGatewayBaseUrl ?? '').trim() || (process.env.OPENAI_BASE_URL ?? '').trim() || '';
    const apiKey = (s.aiGatewayApiKey ?? '').trim() || (process.env.OPENAI_API_KEY ?? '').trim() || '';
    const model = (s.defaultModel ?? '').trim() || (process.env.OPENAI_DEFAULT_MODEL ?? 'gpt-4o-mini').trim();
    if (!baseUrl || !apiKey) return null;
    return {
      config: {
        baseUrl,
        apiKey,
        defaultModel: model,
        timeoutMs: PROVIDER_TIMEOUT_MS,
        providerLabel: 'admin-gateway',
      },
      model,
    };
  }

  /**
   * Convert the static AI_CHAT_TOOLS descriptors into the wire format
   * the provider expects. Re-exported so the test suite can assert the
   * shape without dragging in the whole adapter.
   */
  toInternalDescriptors(): InternalToolDescriptor[] {
    return AI_CHAT_TOOLS.map((t: IAiChatToolDescriptor) => ({
      name: t.name,
      description: t.description,
      parameters: aiChatParametersToJsonSchema(t.parameters),
    }));
  }

  /**
   * Run a chat turn. Returns `configured: false` when no provider is
   * available — the controller decides what to do (echo fallback or
   * surface a 503).
   */
  async run(
    args: AiChatLlmRunArgs,
    setting: IAiSetting | null | undefined,
    fetchOverride?: typeof fetch
  ): Promise<AiChatLlmRunResult> {
    const resolved = this.resolveProviderConfig(setting);
    if (!resolved) {
      return {
        text: '',
        toolCalls: [],
        citations: [],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, chunks: 0 },
        steps: 0,
        finishReason: 'stop',
        provider: null,
        configured: false,
      };
    }
    const adapterConfig: AdapterConfig = {
      provider: resolved.config,
      defaultModel: resolved.model,
      ...(fetchOverride ? { fetchImpl: fetchOverride } : args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
    };
    try {
      const out = await runChat(
        {
          system: args.system,
          messages: args.messages,
          tools: this.toInternalDescriptors(),
          baseId: args.baseId,
          executeTool: (name, toolArgs) => this.executeTool(name, toolArgs, args.baseId),
          budget: args.budget,
          temperature: args.temperature,
          max_tokens: args.max_tokens,
          signal: args.signal,
        },
        adapterConfig
      );
      return {
        ...out,
        provider: {
          label: resolved.config.providerLabel,
          baseUrl: resolved.config.baseUrl,
          model: resolved.model,
        },
        configured: true,
      };
    } catch (err) {
      if (err instanceof ChatProviderError) {
        this.logger.warn(
          `ai-chat llm run failed: code=${err.code} status=${err.httpStatus ?? 'n/a'} message=${err.message}`
        );
        throw err;
      }
      throw err;
    }
  }

  /**
   * Stream a chat turn. Same semantics as `run` but yields deltas as
   * they arrive from the provider.
   */
  async *stream(
    args: AiChatLlmRunArgs,
    setting: IAiSetting | null | undefined,
    fetchOverride?: typeof fetch
  ): AsyncGenerator<
    | { delta: string }
    | { toolCall: ParsedToolCall }
    | { final: AiChatLlmRunResult }
  > {
    const resolved = this.resolveProviderConfig(setting);
    if (!resolved) {
      return yield {
        final: {
          text: '',
          toolCalls: [],
          citations: [],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, chunks: 0 },
          steps: 0,
          finishReason: 'stop',
          provider: null,
          configured: false,
        },
      };
    }
    const adapterConfig: AdapterConfig = {
      provider: resolved.config,
      defaultModel: resolved.model,
      ...(fetchOverride ? { fetchImpl: fetchOverride } : args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
    };
    let final: AiChatLlmRunResult | null = null;
    for await (const ev of runChatStream(
      {
        system: args.system,
        messages: args.messages,
        tools: this.toInternalDescriptors(),
        baseId: args.baseId,
        executeTool: (name, toolArgs) => this.executeTool(name, toolArgs, args.baseId),
        budget: args.budget,
        temperature: args.temperature,
        max_tokens: args.max_tokens,
        signal: args.signal,
      },
      adapterConfig
    )) {
      if (ev.delta !== undefined) {
        yield { delta: ev.delta };
      } else if (ev.toolCall !== undefined) {
        yield { toolCall: ev.toolCall };
      } else if (ev.text !== undefined || ev.usage !== undefined) {
        final = {
          text: ev.text ?? '',
          toolCalls: [],
          citations: [],
          usage: ev.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, chunks: 0 },
          steps: 1,
          finishReason: ev.finishReason ?? 'stop',
          provider: {
            label: resolved.config.providerLabel,
            baseUrl: resolved.config.baseUrl,
            model: resolved.model,
          },
          configured: true,
        };
      }
    }
    if (final) yield { final };
  }

  /**
   * Execute a tool call by routing through AiChatToolsService. The
   * service enforces base + table scoping; this wrapper keeps the
   * adapter focused on provider protocol and lets the tools service
   * handle permission + audit.
   */
  private async executeTool(name: string, args: Record<string, unknown>, baseId?: string): Promise<unknown> {
    const enriched = baseId ? { ...args, baseId: args.baseId ?? baseId } : args;
    const result = await this.tools.invoke(name, enriched);
    if (!result.ok) {
      return { error: result.markdown, rows: result.rows };
    }
    return { markdown: result.markdown, rows: result.rows, toolName: result.toolName };
  }
}

/* ─── helpers ────────────────────────────────────────────────────── */

function aiChatParametersToJsonSchema(
  params: IAiChatToolDescriptor['parameters']
): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of params) {
    properties[p.name] = {
      type: p.type === 'number' ? 'number' : p.type === 'boolean' ? 'boolean' : 'string',
      description: p.description,
    };
    if (p.required) required.push(p.name);
  }
  const schema: Record<string, unknown> = { type: 'object', properties };
  if (required.length > 0) schema.required = required;
  schema.additionalProperties = false;
  return schema;
}
