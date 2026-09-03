/**
 * AI Chat tool bridge (R58).
 *
 * Pure helpers that translate between Teable's internal tool registry
 * (`AiChatToolsService`) and the OpenAI function-calling wire format.
 *
 *   toolsToOpenAIFunctions(tools)   → ChatTool[]    (provider-bound)
 *   parseAssistantToolCalls(choice) → ParsedToolCall[] (typed args)
 *   toolResultMessage(call, result) → ChatMessage   (round-trip back into conversation)
 *
 * Also produces citation-friendly tool-result metadata so the renderer
 * can show `[table=tbl_x record=rec_y]` badges next to claims.
 */

import type {
  ChatMessage,
  ChatTool,
  ChatToolCall,
} from './ai-chat-llm-provider';

export type InternalToolDescriptor = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ParsedToolCall = {
  id: string;
  name: string;
  /** Decoded JSON arguments. Falls back to `{}` when the LLM emits malformed JSON. */
  args: Record<string, unknown>;
  /** Raw JSON string for audit + replay. */
  argumentsJson: string;
  /** Optional citation hint extracted from the tool result. */
  citation: { table?: string; record?: string; field?: string } | null;
};

/* ─── registry → wire ────────────────────────────────────────────── */

export const MAX_TOOL_NAME_LENGTH = 64;
export const MAX_TOOL_DESCRIPTION_LENGTH = 1024;

/** Convert internal tool descriptors into the wire format used by
 *  OpenAI-compatible providers. Returns `[]` when given an empty list. */
export function toolsToOpenAIFunctions(tools: InternalToolDescriptor[]): ChatTool[] {
  if (!Array.isArray(tools) || tools.length === 0) return [];
  const out: ChatTool[] = [];
  const seen = new Set<string>();
  for (const t of tools) {
    if (!t || typeof t !== 'object') continue;
    const name = typeof t.name === 'string' ? t.name : '';
    if (!name || name.length > MAX_TOOL_NAME_LENGTH) continue;
    if (seen.has(name)) continue; // dedupe; provider requires unique names
    seen.add(name);
    const description = typeof t.description === 'string' ? t.description.slice(0, MAX_TOOL_DESCRIPTION_LENGTH) : '';
    const parameters = (t.parameters && typeof t.parameters === 'object') ? t.parameters : { type: 'object', properties: {} };
    out.push({ type: 'function', function: { name, description, parameters } });
  }
  return out;
}

/* ─── wire → parsed ──────────────────────────────────────────────── */

/** Parse `assistant.message.tool_calls[]` into typed objects. Bad JSON
 *  in `arguments` is captured as `argumentsJson` + empty `args`. */
export function parseAssistantToolCalls(
  tool_calls: ChatToolCall[] | undefined
): ParsedToolCall[] {
  if (!Array.isArray(tool_calls) || tool_calls.length === 0) return [];
  const out: ParsedToolCall[] = [];
  for (const tc of tool_calls) {
    const id = typeof tc.id === 'string' ? tc.id : '';
    const name = typeof tc.name === 'string' ? tc.name : '';
    const argumentsJson = typeof tc.arguments === 'string' ? tc.arguments : '';
    let args: Record<string, unknown> = {};
    if (argumentsJson.trim().length > 0) {
      try {
        const parsed = JSON.parse(argumentsJson);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
    }
    out.push({
      id,
      name,
      args,
      argumentsJson,
      citation: extractCitationHint(name, args),
    });
  }
  return out;
}

/** Same as above but for SSE delta aggregation — tool calls arrive
 *  incrementally, so we have to merge by `index`. Returns the
 *  fully-assembled ParsedToolCall[] when all deltas are in. */
export function mergeStreamedToolCallDeltas(
  deltas: Array<{ index: number; id?: string; name?: string; arguments?: string }>
): ParsedToolCall[] {
  const byIndex = new Map<number, { id: string; name: string; arguments: string }>();
  for (const d of deltas) {
    let entry = byIndex.get(d.index);
    if (!entry) {
      entry = { id: '', name: '', arguments: '' };
      byIndex.set(d.index, entry);
    }
    if (typeof d.id === 'string') entry.id = d.id;
    if (typeof d.name === 'string') entry.name = d.name;
    if (typeof d.arguments === 'string') entry.arguments += d.arguments;
  }
  const out: ParsedToolCall[] = [];
  for (const [index, e] of byIndex.entries()) {
    let args: Record<string, unknown> = {};
    if (e.arguments.trim().length > 0) {
      try {
        const parsed = JSON.parse(e.arguments);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
    }
    out.push({
      id: e.id || `toolcall_${index}`,
      name: e.name,
      args,
      argumentsJson: e.arguments,
      citation: extractCitationHint(e.name, args),
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/* ─── tool result → chat message ─────────────────────────────────── */

/** Wrap a tool execution result as the next `tool` chat message so
 *  the LLM can continue the conversation with the data inline. The
 *  `content` field is JSON-serialised so the LLM receives structured
 *  data instead of `Object.toString()` gibberish. */
export function toolResultMessage(
  call: ParsedToolCall,
  result: unknown
): ChatMessage {
  let content: string;
  try {
    content = JSON.stringify(result ?? null);
  } catch {
    content = String(result ?? null);
  }
  if (content.length > 32 * 1024) {
    content = content.slice(0, 32 * 1024 - 1) + '\u2026';
  }
  return { role: 'tool', content, tool_call_id: call.id, name: call.name };
}

/* ─── citation hints ─────────────────────────────────────────────── */

function extractCitationHint(
  name: string,
  args: Record<string, unknown>
): ParsedToolCall['citation'] {
  if (!args) return null;
  const lower = name.toLowerCase();
  const out: NonNullable<ParsedToolCall['citation']> = {};
  if (typeof args.tableId === 'string') out.table = args.tableId;
  else if (typeof args.table === 'string') out.table = args.table;
  if (typeof args.recordId === 'string') out.record = args.recordId;
  else if (typeof args.record === 'string') out.record = args.record;
  else if (lower.startsWith('record_') && Array.isArray(args.records)) {
    const first = args.records[0];
    if (first && typeof first === 'object') {
      const f = first as Record<string, unknown>;
      if (typeof f.id === 'string') out.record = f.id;
    }
  }
  if (typeof args.fieldId === 'string') out.field = args.fieldId;
  else if (typeof args.field === 'string') out.field = args.field;
  if (!out.table && !out.record && !out.field) return null;
  return out;
}

/* ─── tool loop budget ───────────────────────────────────────────── */

export type ToolLoopBudget = {
  /** Maximum LLM round-trips allowed for a single turn. */
  maxSteps: number;
  /** Maximum tool calls per turn (sum across steps). */
  maxToolCalls: number;
  /** Wall-clock budget in ms. */
  maxDurationMs: number;
};

export const DEFAULT_TOOL_LOOP_BUDGET: ToolLoopBudget = {
  maxSteps: 4,
  maxToolCalls: 12,
  maxDurationMs: 30_000,
};

/** Decide whether the loop can keep going. */
export function canContinueToolLoop(
  budget: ToolLoopBudget,
  state: { steps: number; toolCalls: number; startedAt: number },
  now: number
): { ok: true } | { ok: false; reason: 'STEPS_EXCEEDED' | 'TOOL_CALLS_EXCEEDED' | 'DURATION_EXCEEDED' } {
  if (state.steps >= budget.maxSteps) return { ok: false, reason: 'STEPS_EXCEEDED' };
  if (state.toolCalls >= budget.maxToolCalls) return { ok: false, reason: 'TOOL_CALLS_EXCEEDED' };
  if (now - state.startedAt > budget.maxDurationMs) return { ok: false, reason: 'DURATION_EXCEEDED' };
  return { ok: true };
}
