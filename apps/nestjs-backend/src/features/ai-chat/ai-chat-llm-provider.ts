/**
 * AI Chat LLM provider (R58).
 *
 * Self-contained OpenAI-compatible HTTP client. Pure helpers only:
 *   - buildChatRequestBody  — turn a normalized request into a JSON body
 *   - parseChatResponseBody — turn a non-streaming response into ChatResponse
 *   - parseSseStream        — turn an async iterator of bytes into ChatChunk[]
 *   - normalizeChatRequest  — validate + default + clamp inputs
 *   - estimateTokens        — best-effort token estimate (chars / 4 fallback)
 *
 * No `fetch`, no `ai` SDK, no Anthropic / OpenAI / huggingface packages.
 * The real `fetch` is injected at the boundary (LlmProviderAdapter) so
 * unit tests can drive the parser with byte sequences.
 *
 * Why OpenAI-compatible? Cloud's AI Chat providers (OpenAI, OpenAI
 * Compatible, Anthropic via gateway, Ollama) all expose the same wire
 * format — `POST /v1/chat/completions` with `messages[]` + `tools[]` and
 * SSE `data: {\n...\n}` chunks. Adopting it lets Teable point at any
 * upstream without forking the parser.
 */

import { Buffer } from 'node:buffer';

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessage =
  | { role: 'system'; content: string; name?: string }
  | { role: 'user'; content: string; name?: string }
  | { role: 'assistant'; content: string; tool_calls?: ChatToolCall[]; name?: string }
  | { role: 'tool'; content: string; tool_call_id: string; name?: string };

export type ChatToolCall = {
  /** OpenAI-assigned tool call id (matches the `tool` message's `tool_call_id`). */
  id: string;
  /** Tool name registered in `tools`. */
  name: string;
  /** JSON-encoded arguments; parsed lazily by the caller. */
  arguments: string;
};

export type ChatTool = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatRequest = {
  /** Model identifier (provider-specific). */
  model: string;
  messages: ChatMessage[];
  /** Optional tool definitions in OpenAI function-calling format. */
  tools?: ChatTool[];
  /** How the model should pick a tool: `auto` | `none` | required name. */
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  /** Provider-specific passthrough (kept small; never include secrets). */
  extra?: Record<string, unknown>;
};

export type ChatResponse = {
  id: string;
  model: string;
  created: number;
  choices: Array<{
    index: number;
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'function_call' | string;
    message: {
      role: 'assistant';
      content: string;
      tool_calls?: ChatToolCall[];
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type ChatChunk = {
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
};

export type ChatProviderConfig = {
  /** API base URL (no trailing slash). e.g. `https://api.openai.com/v1` */
  baseUrl: string;
  /** Bearer token. Never logged or returned. */
  apiKey: string;
  /** Default model to use when the request omits one. */
  defaultModel: string;
  /** Request timeout in ms (default 30s). */
  timeoutMs?: number;
  /** Provider name for diagnostics. */
  providerLabel?: string;
};

/* ─── error codes ─────────────────────────────────────────────────── */

export type ChatProviderErrorCode =
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_REQUEST_INVALID'
  | 'PROVIDER_REQUEST_TIMEOUT'
  | 'PROVIDER_NETWORK'
  | 'PROVIDER_RESPONSE_INVALID'
  | 'PROVIDER_HTTP_4XX'
  | 'PROVIDER_HTTP_5XX'
  | 'PROVIDER_SSE_MALFORMED';

export class ChatProviderError extends Error {
  readonly code: ChatProviderErrorCode;
  readonly httpStatus?: number;
  readonly upstream?: unknown;
  constructor(code: ChatProviderErrorCode, message: string, httpStatus?: number, upstream?: unknown) {
    super(message);
    this.name = 'ChatProviderError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstream = upstream;
  }
}

/* ─── request validation ─────────────────────────────────────────── */

export const MAX_MESSAGES = 256;
export const MAX_MESSAGE_BYTES = 32 * 1024;
export const MAX_TOOLS = 64;
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_MAX_TOKENS = 1024;
export const MAX_MAX_TOKENS = 8192;

export type NormalizedChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ChatTool[];
  tool_choice?: ChatRequest['tool_choice'];
  temperature: number;
  top_p: number;
  max_tokens: number;
  stream: boolean;
  extra: Record<string, unknown>;
};

export function normalizeChatRequest(
  input: ChatRequest,
  options: { defaultModel: string; stream: boolean }
): NormalizedChatRequest {
  if (!input || typeof input !== 'object') {
    throw new ChatProviderError('PROVIDER_REQUEST_INVALID', 'chat request must be an object');
  }
  let model: string;
  if (typeof input.model === 'string' && input.model.length > 0) {
    model = input.model;
  } else if (typeof options.defaultModel === 'string' && options.defaultModel.length > 0) {
    model = options.defaultModel;
  } else {
    throw new ChatProviderError('PROVIDER_REQUEST_INVALID', 'model is required');
  }
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new ChatProviderError('PROVIDER_REQUEST_INVALID', 'messages[] must be non-empty');
  }
  if (input.messages.length > MAX_MESSAGES) {
    throw new ChatProviderError('PROVIDER_REQUEST_INVALID', `messages[] exceeds max ${MAX_MESSAGES}`);
  }
  const messages: ChatMessage[] = [];
  for (const m of input.messages) {
    if (!m || typeof m !== 'object') {
      throw new ChatProviderError('PROVIDER_REQUEST_INVALID', 'message must be an object');
    }
    const role = m.role;
    if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool') {
      throw new ChatProviderError('PROVIDER_REQUEST_INVALID', `unknown role: ${String(role)}`);
    }
    if (role === 'tool') {
      if (typeof (m as { tool_call_id?: unknown }).tool_call_id !== 'string' || (m as { tool_call_id: string }).tool_call_id.length === 0) {
        throw new ChatProviderError('PROVIDER_REQUEST_INVALID', 'tool message requires tool_call_id');
      }
    }
    if (typeof (m as { content?: unknown }).content !== 'string') {
      throw new ChatProviderError('PROVIDER_REQUEST_INVALID', `message.content must be a string (role=${role})`);
    }
    if (Buffer.byteLength((m as { content: string }).content, 'utf8') > MAX_MESSAGE_BYTES) {
      throw new ChatProviderError('PROVIDER_REQUEST_INVALID', `message.content exceeds ${MAX_MESSAGE_BYTES} bytes`);
    }
    messages.push(m as ChatMessage);
  }
  let tools: ChatTool[] | undefined;
  if (input.tools !== undefined) {
    if (!Array.isArray(input.tools)) {
      throw new ChatProviderError('PROVIDER_REQUEST_INVALID', 'tools must be an array');
    }
    if (input.tools.length > MAX_TOOLS) {
      throw new ChatProviderError('PROVIDER_REQUEST_INVALID', `tools exceeds max ${MAX_TOOLS}`);
    }
    tools = input.tools;
  }
  const temperature = clampNumber(input.temperature, DEFAULT_TEMPERATURE, 0, 2);
  const top_p = clampNumber(input.top_p, 1, 0, 1);
  const max_tokens = clampInt(input.max_tokens, DEFAULT_MAX_TOKENS, 1, MAX_MAX_TOKENS);
  const extra: Record<string, unknown> = input.extra && typeof input.extra === 'object' ? input.extra : {};
  return {
    model,
    messages,
    tools,
    tool_choice: input.tool_choice,
    temperature,
    top_p,
    max_tokens,
    stream: options.stream,
    extra,
  };
}

function clampNumber(input: unknown, fallback: number, min: number, max: number): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return fallback;
  let v: number = input;
  if (v > max) v = max;
  if (v < min) v = min;
  return v;
}
function clampInt(input: unknown, fallback: number, min: number, max: number): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return fallback;
  let v: number = Math.floor(input);
  if (v < min) v = min;
  if (v > max) v = max;
  return v;
}

/* ─── request body ───────────────────────────────────────────────── */

export function buildChatRequestBody(req: NormalizedChatRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
    temperature: req.temperature,
    top_p: req.top_p,
    max_tokens: req.max_tokens,
    stream: req.stream,
  };
  if (req.tools && req.tools.length > 0) body.tools = req.tools;
  if (req.tool_choice !== undefined) body.tool_choice = req.tool_choice;
  for (const [k, v] of Object.entries(req.extra)) body[k] = v;
  return body;
}

/* ─── response pars ───────────────────────────────────────────────── */

export function parseChatResponseBody(raw: unknown): ChatResponse {
  if (!raw || typeof raw !== 'object') {
    throw new ChatProviderError('PROVIDER_RESPONSE_INVALID', 'response body is not an object');
  }
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id : 'chatcmpl-' + randomHex();
  const model = typeof obj.model === 'string' ? obj.model : 'unknown';
  const created = typeof obj.created === 'number' ? obj.created : Math.floor(Date.now() / 1000);
  if (!Array.isArray(obj.choices) || obj.choices.length === 0) {
    throw new ChatProviderError('PROVIDER_RESPONSE_INVALID', 'response choices[] is missing or empty');
  }
  const choices: ChatResponse['choices'] = obj.choices.map((c, index) => {
    if (!c || typeof c !== 'object') {
      throw new ChatProviderError('PROVIDER_RESPONSE_INVALID', `choices[${index}] is not an object`);
    }
    const cc = c as Record<string, unknown>;
    const message = cc.message as Record<string, unknown> | undefined;
    if (!message || typeof message !== 'object') {
      throw new ChatProviderError('PROVIDER_RESPONSE_INVALID', `choices[${index}].message is missing`);
    }
    const role = message.role;
    if (role !== 'assistant') {
      throw new ChatProviderError('PROVIDER_RESPONSE_INVALID', `choices[${index}].message.role must be assistant`);
    }
    const content = typeof message.content === 'string' ? message.content : '';
    let tool_calls: ChatToolCall[] | undefined;
    if (Array.isArray(message.tool_calls)) {
      tool_calls = message.tool_calls.map((t, ti) => {
        if (!t || typeof t !== 'object') {
          throw new ChatProviderError('PROVIDER_RESPONSE_INVALID', `tool_calls[${ti}] is not an object`);
        }
        const tt = t as Record<string, unknown>;
        const fn = tt.function as Record<string, unknown> | undefined;
        if (!fn || typeof fn !== 'object' || typeof fn.name !== 'string') {
          throw new ChatProviderError('PROVIDER_RESPONSE_INVALID', `tool_calls[${ti}].function.name is required`);
        }
        return {
          id: typeof tt.id === 'string' ? tt.id : `toolcall_${ti}`,
          name: fn.name,
          arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
        };
      });
    }
    return {
      index: typeof cc.index === 'number' ? cc.index : index,
      finish_reason: typeof cc.finish_reason === 'string' ? cc.finish_reason : 'stop',
      message: { role: 'assistant', content, tool_calls },
    };
  });
  let usage: ChatResponse['usage'] | undefined;
  if (obj.usage && typeof obj.usage === 'object') {
    const u = obj.usage as Record<string, unknown>;
    usage = {
      prompt_tokens: typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0,
      completion_tokens: typeof u.completion_tokens === 'number' ? u.completion_tokens : 0,
      total_tokens: typeof u.total_tokens === 'number' ? u.total_tokens : 0,
    };
  }
  return { id, model, created, choices, usage };
}

/* ─── SSE parser ─────────────────────────────────────────────────── */

/** SSE event frame produced by the parser. */
export type SseFrame =
  | { kind: 'data'; payload: string }
  | { kind: 'event'; name: string; data: string }
  | { kind: 'comment'; text: string }
  | { kind: 'retry'; ms: number }
  | { kind: 'done' };

/**
 * Parse a single SSE frame from a buffer that contains one or more
 * complete `\n\n`-terminated frames. Returns the parsed frame plus
 * any remaining bytes (the caller feeds them into the next call).
 */
export function parseSseFrame(buffer: string): { frame: SseFrame | null; rest: string } {
  const sep = buffer.indexOf('\n\n');
  if (sep === -1) return { frame: null, rest: buffer };
  const raw = buffer.slice(0, sep);
  const rest = buffer.slice(sep + 2);
  let name = 'message';
  const dataLines: string[] = [];
  let retry: number | null = null;
  for (const line of raw.split('\n')) {
    if (line.length === 0) continue;
    if (line.startsWith(':')) {
      // SSE comment; ignore.
      continue;
    }
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon);
    let value = line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
    else if (field === 'event') name = value;
    else if (field === 'retry') {
      const n = Number(value);
      if (Number.isFinite(n)) retry = n;
    }
  }
  if (dataLines.length > 0 && dataLines.join('\n') === '[DONE]') {
    return { frame: { kind: 'done' }, rest };
  }
  if (dataLines.length > 0) {
    return { frame: { kind: 'event', name, data: dataLines.join('\n') }, rest };
  }
  if (retry !== null) {
    return { frame: { kind: 'retry', ms: retry }, rest };
  }
  // Comment-only frame (no data, no retry) — return null so the caller
  // re-invokes us with `rest` to find the next real frame.
  return { frame: null, rest };
}

/**
 * Decode SSE byte chunks into ChatChunk objects. Yields one chunk per
 * `data: {\n...\n}` frame. Skips empty / comment / retry-only frames.
 *
 * The input iterator yields `Uint8Array` chunks in the order received
 * from the network; we decode them as UTF-8 and feed the resulting
 * string into `parseSseFrame`. Incomplete UTF-8 sequences are buffered.
 */
export async function* parseSseStream(
  bytes: AsyncIterable<Uint8Array>
): AsyncGenerator<ChatChunk> {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  for await (const chunk of bytes) {
    buffer += decoder.decode(chunk, { stream: true });
    while (true) {
      const { frame, rest } = parseSseFrame(buffer);
      buffer = rest;
      if (!frame) break;
      if (frame.kind !== 'event') continue;
      if (frame.name !== 'message') continue;
      try {
        const parsed = JSON.parse(frame.data);
        yield parseChatChunk(parsed);
      } catch (err) {
        throw new ChatProviderError(
          'PROVIDER_SSE_MALFORMED',
          `failed to parse SSE frame: ${(err as Error).message}`,
          undefined,
          frame.data
        );
      }
    }
  }
  // Flush any trailing decode state.
  buffer += decoder.decode();
}

function parseChatChunk(raw: unknown): ChatChunk {
  if (!raw || typeof raw !== 'object') {
    throw new ChatProviderError('PROVIDER_SSE_MALFORMED', 'SSE chunk is not an object');
  }
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' ? obj.id : 'chatcmpl-' + randomHex();
  const model = typeof obj.model === 'string' ? obj.model : 'unknown';
  const created = typeof obj.created === 'number' ? obj.created : Math.floor(Date.now() / 1000);
  if (!Array.isArray(obj.choices)) {
    throw new ChatProviderError('PROVIDER_SSE_MALFORMED', 'chunk.choices[] is missing');
  }
  const choices: ChatChunk['choices'] = obj.choices.map((c, index) => {
    if (!c || typeof c !== 'object') {
      throw new ChatProviderError('PROVIDER_SSE_MALFORMED', `chunk.choices[${index}] invalid`);
    }
    const cc = c as Record<string, unknown>;
    const delta = (cc.delta && typeof cc.delta === 'object' ? cc.delta : {}) as Record<string, unknown>;
    let tool_calls: ChatChunk['choices'][number]['delta']['tool_calls'];
    if (Array.isArray(delta.tool_calls)) {
      tool_calls = delta.tool_calls.map((t, ti) => {
        const tt = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;
        const fn = (tt.function && typeof tt.function === 'object' ? tt.function : {}) as Record<string, unknown>;
        return {
          index: typeof tt.index === 'number' ? tt.index : ti,
          ...(typeof tt.id === 'string' ? { id: tt.id } : {}),
          ...(typeof fn.name === 'string' ? { name: fn.name } : {}),
          ...(typeof fn.arguments === 'string' ? { arguments: fn.arguments } : {}),
        };
      });
    }
    return {
      index: typeof cc.index === 'number' ? cc.index : index,
      delta: {
        ...(delta.role === 'assistant' ? { role: 'assistant' as const } : {}),
        ...(typeof delta.content === 'string' ? { content: delta.content } : {}),
        ...(tool_calls ? { tool_calls } : {}),
      },
      finish_reason: typeof cc.finish_reason === 'string' ? cc.finish_reason : null,
    };
  });
  let usage: ChatChunk['usage'];
  if (obj.usage && typeof obj.usage === 'object') {
    const u = obj.usage as Record<string, unknown>;
    usage = {
      prompt_tokens: typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0,
      completion_tokens: typeof u.completion_tokens === 'number' ? u.completion_tokens : 0,
      total_tokens: typeof u.total_tokens === 'number' ? u.total_tokens : 0,
    };
  }
  return { id, model, created, choices, usage };
}

function randomHex(): string {
  return Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
}

/* ─── token estimation (best-effort fallback) ────────────────────── */

/** Best-effort token estimate. We cannot run tiktoken without external
 *  deps, so we approximate by characters / 4 (English averages). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // Round up to whole tokens; very long content gets a small bump for safety.
  return Math.max(1, Math.ceil(text.length / 4));
}

/* ─── usage aggregator ───────────────────────────────────────────── */

export type UsageAggregator = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  chunks: number;
};

/** Accumulate token usage from a stream of ChatChunks. */
export function createUsageAggregator(): UsageAggregator {
  return { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, chunks: 0 };
}

export function accumulateUsage(acc: UsageAggregator, chunk: ChatChunk | ChatResponse): void {
  if (chunk.usage) {
    acc.prompt_tokens += chunk.usage.prompt_tokens;
    acc.completion_tokens += chunk.usage.completion_tokens;
    acc.total_tokens += chunk.usage.total_tokens;
  }
  acc.chunks += 1;
}

/* ─── assemble streamed response ─────────────────────────────────── */

/**
 * Collapse a stream of ChatChunks into a single ChatResponse. Used by
 * `chatCompletions` when the caller asks for the streamed transport
 * but wants the final assembled object (e.g. for tool-call loops).
 */
export function assembleStreamedResponse(
  chunks: ChatChunk[],
  fallback: { model: string }
): ChatResponse {
  if (chunks.length === 0) {
    throw new ChatProviderError('PROVIDER_RESPONSE_INVALID', 'stream produced no chunks');
  }
  const head = chunks[0];
  const messageByIndex = new Map<number, { content: string; toolCalls: Map<number, ChatToolCall> }>();
  let finishReason: ChatResponse['choices'][number]['finish_reason'] = 'stop';
  let lastUsage: ChatResponse['usage'];
  for (const chunk of chunks) {
    if (chunk.usage) lastUsage = chunk.usage;
    for (const c of chunk.choices) {
      let entry = messageByIndex.get(c.index);
      if (!entry) {
        entry = { content: '', toolCalls: new Map() };
        messageByIndex.set(c.index, entry);
      }
      if (typeof c.delta.content === 'string') {
        entry.content += c.delta.content;
      }
      if (Array.isArray(c.delta.tool_calls)) {
        for (const tc of c.delta.tool_calls) {
          let existing = entry.toolCalls.get(tc.index);
          if (!existing) {
            existing = { id: tc.id ?? '', name: tc.name ?? '', arguments: '' };
            entry.toolCalls.set(tc.index, existing);
          }
          if (typeof tc.id === 'string') existing.id = tc.id;
          if (typeof tc.name === 'string') existing.name = tc.name;
          if (typeof tc.arguments === 'string') existing.arguments += tc.arguments;
        }
      }
      if (c.finish_reason) finishReason = c.finish_reason as typeof finishReason;
    }
  }
  const choices: ChatResponse['choices'] = [];
  for (const [index, entry] of messageByIndex.entries()) {
    const tool_calls = entry.toolCalls.size > 0
      ? Array.from(entry.toolCalls.values()).filter((t) => t.id || t.name || t.arguments)
      : undefined;
    choices.push({
      index,
      finish_reason: finishReason,
      message: { role: 'assistant', content: entry.content, tool_calls },
    });
  }
  choices.sort((a, b) => a.index - b.index);
  return {
    id: head.id,
    model: head.model || fallback.model,
    created: head.created,
    choices,
    usage: lastUsage,
  };
}
