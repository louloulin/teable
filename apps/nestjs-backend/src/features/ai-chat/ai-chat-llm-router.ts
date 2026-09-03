/**
 * AI Chat LLM router (R60).
 *
 * Pure helper that decides which path a chat turn takes:
 *
 *   1. Feature flag enabled + provider configured → AiChatLlmService.run/stream
 *      (real OpenAI-compatible provider, R58/R59 wiring)
 *   2. Feature flag enabled + provider missing  → echo fallback
 *      (deterministic acknowledgement so the UI stays responsive)
 *   3. Feature flag disabled (default)          → `null` so the existing
 *      AiService path stays in charge
 *
 * The router is intentionally small — it composes the AiChatLlmService
 * with a self-contained echo fallback. It does NOT persist messages
 * (that stays in AiChatAuthService so the existing single-turn +
 * streaming methods keep their persist + artifact semantics).
 */

import { ChatProviderError } from './ai-chat-llm-provider';
import { AiChatLlmService, type AiChatLlmRunArgs, type AiChatLlmRunResult } from './ai-chat-llm.service';

export type LlmRouterMode = 'provider' | 'echo' | 'legacy';

export type LlmRouterDecision = {
  /** Which path the caller should take. */
  mode: LlmRouterMode;
  /** Why this mode was picked (caller writes this into audit / logs). */
  reason: string;
  /** True when the feature flag is enabled regardless of which path runs. */
  flagEnabled: boolean;
};

/* ─── feature flag ──────────────────────────────────────────────── */

export const FEATURE_FLAG_ENV = 'AI_CHAT_LLM_ROUTER_ENABLED';

export function readFeatureFlag(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[FEATURE_FLAG_ENV];
  if (typeof raw !== 'string') return false;
  const lower = raw.trim().toLowerCase();
  return lower === '1' || lower === 'true' || lower === 'yes' || lower === 'on';
}

/**
 * Decide which path a chat turn should take. The caller passes the
 * current IAiSetting + the AiChatLlmService so we can ask it whether
 * a provider is configured without running the actual LLM call.
 */
export function decideLlmRoute(
  setting: Parameters<AiChatLlmService['resolveProviderConfig']>[0],
  env: NodeJS.ProcessEnv = process.env,
  service?: Pick<AiChatLlmService, 'resolveProviderConfig'>
): LlmRouterDecision {
  const flagEnabled = readFeatureFlag(env);
  if (!flagEnabled) {
    return { mode: 'legacy', reason: 'feature flag disabled', flagEnabled };
  }
  const provider = service
    ? service.resolveProviderConfig(setting)
    : new AiChatLlmService(undefined as never).resolveProviderConfig(setting);
  if (provider) {
    return { mode: 'provider', reason: 'flag enabled + provider configured', flagEnabled };
  }
  return { mode: 'echo', reason: 'flag enabled but provider missing', flagEnabled };
}

/* ─── echo fallback (self-contained) ────────────────────────────── */

const ECHO_MAX_TEXT = 1_400;

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

/**
 * Build a deterministic echo reply that:
 *   • acknowledges the latest user message,
 *   • lists available tools so the user sees what is wired,
 *   • explains how to upgrade to a real LLM (only on the first turn
 *     of the conversation — `seenHints` is mutated by the caller).
 *
 * Pure: same inputs always produce the same text.
 */
export function buildEchoReply(args: {
  userMessage: string;
  toolNames: ReadonlyArray<string>;
  baseId?: string;
  seenHints: Set<string>;
}): { text: string; shouldShowUpgradeHint: boolean } {
  const ctxKey = args.baseId ?? 'no-base';
  const shouldShowUpgradeHint = !args.seenHints.has(ctxKey);
  if (shouldShowUpgradeHint) args.seenHints.add(ctxKey);
  const toolList = args.toolNames.length > 0 ? `\n\nTools ready: ${args.toolNames.join(', ')}` : '';
  const upgradeHint = shouldShowUpgradeHint
    ? '\n\n(I am the built-in fallback — configure an LLM provider via the Admin AI Gateway to enable real replies.)'
    : '';
  const user = truncate(args.userMessage, 240);
  const baseTag = args.baseId ? `[base=${args.baseId}] ` : '';
  const text = truncate(
    `Got it — ${baseTag}you wrote: "${user}". No external LLM is configured, so this is a deterministic placeholder reply.${toolList}${upgradeHint}`,
    ECHO_MAX_TEXT
  );
  return { text, shouldShowUpgradeHint };
}

/* ─── adapter runners ───────────────────────────────────────────── */

/**
 * Run a chat turn via the router. Returns `{ source: 'provider', result }`
 * when a real LLM answered, or `{ source: 'echo', result }` when the
 * echo fallback ran. The caller is responsible for persisting the
 * assistant message.
 */
export async function runLlmRoutedTurn(
  args: AiChatLlmRunArgs,
  setting: Parameters<AiChatLlmService['resolveProviderConfig']>[0],
  deps: {
    llmService: AiChatLlmService;
    env?: NodeJS.ProcessEnv;
  }
): Promise<
  | { source: 'provider'; result: AiChatLlmRunResult }
  | { source: 'echo'; result: AiChatLlmRunResult }
> {
  const decision = decideLlmRoute(setting, deps.env ?? process.env, deps.llmService);
  if (decision.mode === 'echo') {
    const toolNames = deps.llmService.toInternalDescriptors().map((t) => t.name);
    const seen = new Set<string>();
    const echo = buildEchoReply({
      userMessage: args.messages.find((m) => m.role === 'user')?.content ?? '',
      toolNames,
      baseId: args.baseId,
      seenHints: seen,
    });
    return {
      source: 'echo',
      result: {
        text: echo.text,
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
  if (decision.mode === 'provider') {
    try {
      const result = await deps.llmService.run(args, setting, args.fetchImpl);
      return { source: 'provider', result };
    } catch (err) {
      if (err instanceof ChatProviderError) {
        // Surface the error to the caller — they decide whether to
        // fall back to echo or 503. We return a tagged `provider` so
        // the caller can render `error.code` to the UI.
        return {
          source: 'provider',
          result: {
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
      throw err;
    }
  }
  // 'legacy' — caller will route to the existing AiService path; this
  // function is only called when flag is on. Return a tagged `echo`
  // with empty text so the controller treats it as not-yet-implemented.
  return {
    source: 'echo',
    result: {
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
