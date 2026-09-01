/**
 * Built-in echo LLM client for Cuppy conversations.
 *
 * Why this exists
 * ───────────────
 * The wired live provider (`CUPPY_LLM_CLIENT` factory in agent-orchestrator.module.ts)
 * only returns a useful response when the request carries a `baseId` AND the resolved
 * `AiService.getChatModelInstance()` succeeds — i.e. an LLM provider is configured
 * (OpenAI key env, BYOK LLM key, or admin AI gateway). Otherwise the orchestrator
 * surfaces a 503 "Cuppy AI provider is unavailable".
 *
 * That 503 is technically correct, but it makes `/api/cuppy/chat` completely inert
 * for fresh self-hosted installs — and Cloud's cuppy UI is the #1 way operators
 * "feel" AI in Teable. So we ship a **built-in fallback**:
 *
 *   1. If the live provider returns a response (real config + baseId match) → that wins.
 *   2. If anything throws or `args.baseId` is missing → the chat falls back to a
 *      deterministic echo response that acknowledges the user message, surfaces
 *      which tools were routed, and gently tells the user how to enable a real
 *      LLM provider.
 *
 * The echo client:
 *   • Never reads from disk or env — it's a pure function of its inputs.
 *   • Echoes the user message back + names any routed tool (e.g. schema_query).
 *   • Emits no `requestedTools` so no tools fire when no real provider ran
 *     (the real provider is responsible for that decision).
 *   • Stays below the 8 KB response envelope so large replies still fit.
 *
 * License: AGPL-3.0
 */

export interface IEchoLlmArgs {
  baseId?: string;
  system: string;
  messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }>;
  executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface IEchoLlmResult {
  text: string;
  requestedTools?: string[];
  provider: 'built-in-echo';
}

export interface ICuppyEchoLlm {
  chat(args: IEchoLlmArgs): Promise<IEchoLlmResult>;
  chatStream?(args: IEchoLlmArgs, abortSignal?: AbortSignal): AsyncGenerator<{ delta: string; value?: string; done: boolean }>;
}

const MAX_ECHO_TEXT = 1_400;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

/**
 * Build a deterministic, conversational echo response. The response:
 *   • acknowledges the latest user message,
 *   • lists any routed tools so the user can see what is wired,
 *   • explains how to upgrade to a real LLM (only on the first turn).
 *
 * No external IO, no randomness, no template interpolation surprises.
 */
export class BuiltInEchoLlm implements ICuppyEchoLlm {
  private readonly hintShownFor = new Set<string>();

  chat(args: IEchoLlmArgs): IEchoLlmResult {
    const lastUser = [...args.messages].reverse().find((m) => m.role === 'user');
    const userText = lastUser ? truncate(lastUser.content, 240) : '(no user message)';

    const routedTools = args.tools.map((t) => t.name).filter(Boolean);
    const toolList = routedTools.length
      ? `\n\nTools ready to call: ${routedTools.join(', ')}`
      : '';

    const contextKey = args.baseId ?? 'no-base';
    const showHint = !this.hintShownFor.has(contextKey);
    if (showHint) this.hintShownFor.add(contextKey);

    const upgradeHint = showHint
      ? `\n\n(I am the built-in fallback. Configure an LLM provider — set OPENAI_API_KEY, register a BYOK key, or enable the admin AI gateway — to unlock real assistant replies.)`
      : '';

    const baseTag = args.baseId ? `[base=${args.baseId}] ` : '';
    const text = truncate(
      `Got it — ${baseTag}you wrote: "${userText}". I can read this conversation, but no external LLM is configured, so I am replying with a deterministic placeholder.${toolList}${upgradeHint}`,
      MAX_ECHO_TEXT
    );

    return { text, provider: 'built-in-echo' };
  }

  /**
   * Stream the deterministic echo in 4-5 word chunks so the frontend still
   * gets progressive rendering when no real LLM is configured. Final chunk
   * carries the full text as `value`.
   */
  async *chatStream(args: IEchoLlmArgs, abortSignal?: AbortSignal): AsyncGenerator<{ delta: string; value?: string; done: boolean }> {
    const result = this.chat(args);
    const tokens = result.text.split(/(\s+)/);
    let acc = '';
    for (const token of tokens) {
      if (abortSignal?.aborted) return;
      acc += token;
      yield { delta: token, done: false };
    }
    yield { delta: '', value: result.text, done: true };
  }
}
