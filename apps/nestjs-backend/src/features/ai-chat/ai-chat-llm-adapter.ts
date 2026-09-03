/**
 * AI Chat LLM adapter (R58).
 *
 * Pure orchestration glue between:
 *   - ai-chat-llm-provider     (OpenAI-compatible HTTP + SSE parser)
 *   - ai-chat-tool-bridge      (tool descriptor ↔ wire format)
 *   - the caller's `executeTool` (actual side-effects: list/get/create records)
 *
 * The adapter is transport-agnostic — it takes a `fetch`-shaped function
 * (so tests can drive a fake upstream) and a `toolExecutor` closure
 * (so production wires real services). It does NOT touch Prisma, AI
 * settings, or usage ledger — those stay at the service layer.
 *
 * Two entry points:
 *   - runChat(args)         — single-shot completion; returns text + tool calls
 *   - runChatStream(args)   — token-by-token delta stream for the UI
 *
 * Both honour `ToolLoopBudget`: the loop terminates when the budget is
 * exhausted or when the LLM emits no tool calls in a step. Errors are
 * surfaced with stable codes; usage is accumulated even on partial
 * failures so callers can still write usage ledger rows.
 */

import {
  assembleStreamedResponse,
  type ChatMessage,
  type ChatProviderConfig,
  type ChatResponse,
  type ChatTool,
  type ChatToolCall,
  ChatProviderError,
  createUsageAggregator,
  accumulateUsage,
  type UsageAggregator,
  parseChatResponseBody,
  parseSseStream,
  buildChatRequestBody,
  normalizeChatRequest,
} from './ai-chat-llm-provider';
import {
  type InternalToolDescriptor,
  type ParsedToolCall,
  type ToolLoopBudget,
  DEFAULT_TOOL_LOOP_BUDGET,
  canContinueToolLoop,
  mergeStreamedToolCallDeltas,
  parseAssistantToolCalls,
  toolResultMessage,
  toolsToOpenAIFunctions,
} from './ai-chat-tool-bridge';

export type AdapterConfig = {
  provider: ChatProviderConfig;
  defaultModel: string;
  /** Optional fetch implementation (defaults to global fetch in production). */
  fetchImpl?: typeof fetch;
};

export type AdapterRunArgs = {
  system: string;
  messages: ChatMessage[];
  tools: InternalToolDescriptor[];
  baseId?: string;
  /** Called for each tool call. Throwing aborts the loop with the error. */
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  budget?: ToolLoopBudget;
  temperature?: number;
  max_tokens?: number;
  signal?: AbortSignal;
};

export type AdapterRunResult = {
  text: string;
  toolCalls: ParsedToolCall[];
  citations: Array<NonNullable<ParsedToolCall['citation']>>;
  usage: UsageAggregator;
  steps: number;
  finishReason: ChatResponse['choices'][number]['finish_reason'];
};

/* ─── fetch helpers ─────────────────────────────────────────────── */

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch
): Promise<Response> {
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal,
  });
}

function authHeaders(provider: ChatProviderConfig): Record<string, string> {
  if (!provider.apiKey) return {};
  return { authorization: `Bearer ${provider.apiKey}` };
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 2048);
  } catch {
    return '';
  }
}

/* ─── single-shot chat ───────────────────────────────────────────── */

/**
 * Run the tool loop synchronously and return the final reply. The loop
 * alternates LLM calls and tool executions until the LLM emits no tool
 * calls or the budget runs out.
 */
export async function runChat(args: AdapterRunArgs, config: AdapterConfig): Promise<AdapterRunResult> {
  const fetchImpl = config.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchImpl) {
    throw new ChatProviderError('PROVIDER_NOT_CONFIGURED', 'fetch is not available in this runtime');
  }
  if (!config.provider.apiKey) {
    throw new ChatProviderError('PROVIDER_NOT_CONFIGURED', 'LLM provider API key is not configured');
  }
  const budget = args.budget ?? DEFAULT_TOOL_LOOP_BUDGET;
  const state = { steps: 0, toolCalls: 0, startedAt: Date.now() };
  const wireTools = toolsToOpenAIFunctions(args.tools);
  const messages: ChatMessage[] = args.messages.slice();
  const usage = createUsageAggregator();
  const toolCalls: ParsedToolCall[] = [];
  const citations: Array<NonNullable<ParsedToolCall['citation']>> = [];
  let finishReason: AdapterRunResult['finishReason'] = 'stop';
  while (true) {
    const continueCheck = canContinueToolLoop(budget, state, Date.now());
    if (!continueCheck.ok) {
      finishReason = continueCheck.reason as AdapterRunResult['finishReason'];
      break;
    }
    state.steps++;
    const normalized = normalizeChatRequest(
      {
        model: config.defaultModel,
        messages: prependSystem(messages, args.system),
        tools: wireTools,
        temperature: args.temperature,
        max_tokens: args.max_tokens,
      },
      { defaultModel: config.defaultModel, stream: false }
    );
    const body = buildChatRequestBody(normalized);
    const response = await postJson(
      `${config.provider.baseUrl.replace(/\/$/, '')}/chat/completions`,
      body,
      authHeaders(config.provider),
      args.signal,
      fetchImpl
    );
    if (!response.ok) {
      const errText = await readErrorBody(response);
      throw new ChatProviderError(
        response.status >= 500 ? 'PROVIDER_HTTP_5XX' : 'PROVIDER_HTTP_4XX',
        `provider ${response.status}: ${errText || response.statusText}`,
        response.status
      );
    }
    const raw = await response.json();
    const parsed = parseChatResponseBody(raw);
    accumulateUsage(usage, parsed);
    const choice = parsed.choices[0];
    if (!choice) break;
    finishReason = choice.finish_reason;
    // Persist the assistant message (so tool result messages can follow).
    const assistantMsg: ChatMessage = { role: 'assistant', content: choice.message.content };
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      assistantMsg.tool_calls = choice.message.tool_calls;
    }
    messages.push(assistantMsg);
    const parsedCalls = parseAssistantToolCalls(choice.message.tool_calls);
    if (parsedCalls.length === 0 || !args.executeTool) break;
    toolCalls.push(...parsedCalls);
    for (const c of parsedCalls) {
      if (c.citation) citations.push(c.citation);
      state.toolCalls++;
      const result = await args.executeTool(c.name, c.args);
      messages.push(toolResultMessage(c, result));
    }
    if (finishReason !== 'tool_calls') break;
  }
  // Last assistant message text is the final answer.
  const finalText = lastAssistantText(messages);
  return { text: finalText, toolCalls, citations, usage, steps: state.steps, finishReason };
}

/* ─── streaming chat ─────────────────────────────────────────────── */

/**
 * Stream the assistant reply. The loop runs the LLM step-by-step and
 * yields `text` deltas + tool-call markers as they happen. The final
 * yield carries the accumulated text + usage. Tool execution is still
 * sequential — we do not parallelise tool calls because Teable's
 * permission + audit checks assume an ordered stream.
 */
export async function* runChatStream(
  args: AdapterRunArgs,
  config: AdapterConfig
): AsyncGenerator<{
  delta?: string;
  toolCall?: ParsedToolCall;
  text?: string;
  usage?: UsageAggregator;
  finishReason?: string;
}> {
  const fetchImpl = config.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchImpl) {
    throw new ChatProviderError('PROVIDER_NOT_CONFIGURED', 'fetch is not available');
  }
  if (!config.provider.apiKey) {
    throw new ChatProviderError('PROVIDER_NOT_CONFIGURED', 'LLM provider API key is not configured');
  }
  const budget = args.budget ?? DEFAULT_TOOL_LOOP_BUDGET;
  const state = { steps: 0, toolCalls: 0, startedAt: Date.now() };
  const wireTools = toolsToOpenAIFunctions(args.tools);
  const messages: ChatMessage[] = args.messages.slice();
  const usage = createUsageAggregator();
  let finalFinish: string = 'stop';
  while (true) {
    const continueCheck = canContinueToolLoop(budget, state, Date.now());
    if (!continueCheck.ok) {
      finalFinish = continueCheck.reason;
      break;
    }
    state.steps++;
    const normalized = normalizeChatRequest(
      {
        model: config.defaultModel,
        messages: prependSystem(messages, args.system),
        tools: wireTools,
        temperature: args.temperature,
        max_tokens: args.max_tokens,
      },
      { defaultModel: config.defaultModel, stream: true }
    );
    const body = buildChatRequestBody(normalized);
    const response = await postJson(
      `${config.provider.baseUrl.replace(/\/$/, '')}/chat/completions`,
      body,
      authHeaders(config.provider),
      args.signal,
      fetchImpl
    );
    if (!response.ok) {
      const errText = await readErrorBody(response);
      throw new ChatProviderError(
        response.status >= 500 ? 'PROVIDER_HTTP_5XX' : 'PROVIDER_HTTP_4XX',
        `provider ${response.status}: ${errText || response.statusText}`,
        response.status
      );
    }
    if (!response.body) {
      throw new ChatProviderError('PROVIDER_RESPONSE_INVALID', 'response body is empty');
    }
    const chunks: Array<{
      id: string;
      model: string;
      created: number;
      choices: Array<{
        index: number;
        delta: {
          role?: 'assistant';
          content?: string;
          tool_calls?: Array<{
            index: number;
            id?: string;
            name?: string;
            arguments?: string;
          }>;
        };
        finish_reason: string | null;
      }>;
      usage?: ChatResponse['usage'];
    }> = [];
    let finishReason: string | null = null;
    for await (const chunk of parseSseStream(response.body)) {
      accumulateUsage(usage, chunk);
      chunks.push(chunk);
      for (const c of chunk.choices) {
        if (typeof c.delta.content === 'string' && c.delta.content.length > 0) {
          yield { delta: c.delta.content };
        }
        if (Array.isArray(c.delta.tool_calls)) {
          // Merge across deltas; emit a marker per assembled tool call at finish.
          // We delay emission to the end of the step so partial deltas aren\'t surfaced.
        }
        if (c.finish_reason) finishReason = c.finish_reason;
      }
    }
    const assembled = assembleStreamedResponse(chunks as never, { model: config.defaultModel });
    const choice = assembled.choices[0];
    if (!choice) break;
    finalFinish = choice.finish_reason;
    const assistantMsg: ChatMessage = { role: 'assistant', content: choice.message.content };
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      assistantMsg.tool_calls = choice.message.tool_calls;
    }
    messages.push(assistantMsg);
    const parsedCalls = parseAssistantToolCalls(choice.message.tool_calls);
    for (const c of parsedCalls) yield { toolCall: c };
    if (parsedCalls.length === 0 || !args.executeTool) break;
    for (const c of parsedCalls) {
      state.toolCalls++;
      const result = await args.executeTool(c.name, c.args);
      messages.push(toolResultMessage(c, result));
    }
    if (finalFinish !== 'tool_calls') break;
  }
  yield { text: lastAssistantText(messages), usage, finishReason: finalFinish };
}

/* ─── helpers ────────────────────────────────────────────────────── */

function prependSystem(messages: ChatMessage[], system: string): ChatMessage[] {
  if (!system) return messages;
  if (messages.length > 0 && messages[0].role === 'system') return messages;
  return [{ role: 'system', content: system }, ...messages];
}

function lastAssistantText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === 'assistant' && m.content) return m.content;
  }
  return '';
}

/* ─── re-exports for tests ───────────────────────────────────────── */

export {
  assembleStreamedResponse,
  buildChatRequestBody,
  mergeStreamedToolCallDeltas,
  normalizeChatRequest,
  parseAssistantToolCalls,
  parseSseStream,
  toolsToOpenAIFunctions,
  toolResultMessage,
  ChatProviderError,
  type ChatTool,
  type ChatMessage,
  type ChatToolCall,
  type ChatProviderConfig,
  type ChatResponse,
};
