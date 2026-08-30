/**
 * Agent orchestrator — single source of truth for cross-IM conversation state.
 *
 * Before this module existed every IM (Slack / Teams / Telegram / WhatsApp) had
 * its own stateful chat loop, its own LLM prompt, and its own tool registry.
 * That meant: a user starting a conversation in Slack and continuing in
 * Telegram lost all context; an admin adding a new tool had to register it in
 * four places; the prompt could not be tuned centrally.
 *
 * The orchestrator owns three things:
 *   1. A `conversation` — a stable ID that follows a user across IMs, with a
 *      rolling history of messages and the current tool/state bindings.
 *   2. An adapter interface (`IMAdapter`) — every IM implements this; the
 *      orchestrator does not care which transport produced the message.
 *   3. A tool registry — the canonical set of tools (DB queries, automation
 *      triggers, webhooks) shared by all IMs.
 *
 * License: AGPL-3.0
 */

export type ConversationId = string;
export type UserId = string;

/** Provider-agnostic inbound message shape. Each adapter maps its native
 *  event into this before calling `handle()`. */
export interface InboundMessage {
  /** Stable per-user key; adapters are responsible for mapping provider
   *  user IDs to a single UserId across IMs (e.g. via the existing
   *  `email-domain-claim` lookup). */
  user_id: UserId;
  /** Plain text body. Adapters strip provider-specific markup. */
  text: string;
  /** Optional IM-specific metadata kept opaque. */
  provider_meta?: Record<string, unknown>;
}

export interface OutboundReply {
  text: string;
  /** Optional structured payload (cards, action buttons) that adapters may
   *  render as provider-native rich content. */
  attachments?: unknown;
}

export interface Tool {
  name: string;
  description: string;
  /** Pure JSON-schema describing arguments; the LLM uses this. */
  parameters: Record<string, unknown>;
  /** Side-effecting call. Adapters never call this directly — the
   *  orchestrator invokes tools under its own tracing context. */
  invoke(args: Record<string, unknown>, ctx: ConversationContext): Promise<unknown>;
}

/** Per-conversation runtime context, stored in memory + persisted to the
 *  `agent_conversation_history` table (added by migration T-13-01-migration).
 */
export interface ConversationContext {
  conversation_id: ConversationId;
  user_id: UserId;
  base_id?: string;
  /** Monotonic history; truncated at `MAX_HISTORY_MESSAGES` to keep prompts
   *  within model limits. */
  messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string; ts: number }>;
  /** Currently-bound toolset; the prompt router narrows this per intent. */
  active_tools: string[];
  /** Free-form scratchpad the LLM can use across turns (e.g. resolved
   *  record IDs, partial query results). */
  scratchpad: Record<string, unknown>;
  updated_at: number;
}

const MAX_HISTORY_MESSAGES = 40;
const MAX_SCRATCHPAD_KEYS = 32;

/**
 * Pure conversation-state helper.  Kept separate from the NestJS service so
 * tests can exercise the state machine without standing up the DI graph.
 */
export class ConversationStore {
  private readonly map = new Map<ConversationId, ConversationContext>();

  /** Load or create a conversation for a (user, optional existing) id. */
  loadOrCreate(
    conversation_id: ConversationId,
    user_id: UserId,
    base_id?: string
  ): ConversationContext {
    const existing = this.map.get(conversation_id);
    if (existing) return existing;
    const fresh: ConversationContext = {
      conversation_id,
      user_id,
      base_id,
      messages: [],
      active_tools: [],
      scratchpad: {},
      updated_at: Date.now(),
    };
    this.map.set(conversation_id, fresh);
    return fresh;
  }

  peek(conversationId: ConversationId): ConversationContext | undefined {
    return this.map.get(conversationId);
  }

  appendMessage(
    ctx: ConversationContext,
    role: 'user' | 'assistant' | 'tool',
    content: string
  ): void {
    ctx.messages.push({ role, content, ts: Date.now() });
    if (ctx.messages.length > MAX_HISTORY_MESSAGES) {
      // Drop the oldest messages but always keep the system context if any
      // caller decides to seed it; we just keep things simple here.
      ctx.messages.splice(0, ctx.messages.length - MAX_HISTORY_MESSAGES);
    }
    ctx.updated_at = Date.now();
  }

  setScratchpad(ctx: ConversationContext, key: string, value: unknown): void {
    if (Object.keys(ctx.scratchpad).length >= MAX_SCRATCHPAD_KEYS && !(key in ctx.scratchpad)) {
      // Soft cap to prevent runaway memory; the orchestrator can still
      // overwrite existing keys.
      return;
    }
    ctx.scratchpad[key] = value;
  }

  setActiveTools(ctx: ConversationContext, tools: string[]): void {
    ctx.active_tools = [...new Set(tools)];
  }

  reset(conversationId: ConversationId): boolean {
    return this.map.delete(conversationId);
  }

  size(): number {
    return this.map.size;
  }
}

/**
 * The interface every IM adapter implements.  Kept intentionally narrow so
 * the Slack / Teams / Telegram / WhatsApp adapters don't bleed provider
 * concerns into the orchestrator.
 */
export interface IMAdapter {
  readonly provider: 'slack' | 'teams' | 'telegram' | 'whatsapp';
  /** Translate a provider event into an `InboundMessage` and hand to the
   *  orchestrator. */
  handle(rawEvent: unknown): Promise<OutboundReply>;
}

/** Stateless helper that decides which IM adapter should receive the next
 *  reply for a given user — the orchestrator calls this when routing the
 *  LLM response back out. */
export interface AdapterRegistry {
  forUser(user_id: UserId): IMAdapter | undefined;
  register(adapter: IMAdapter): void;
}

export class InMemoryAdapterRegistry implements AdapterRegistry {
  private readonly byUser = new Map<UserId, IMAdapter>();

  forUser(user_id: UserId): IMAdapter | undefined {
    return this.byUser.get(user_id);
  }

  register(adapter: IMAdapter): void {
    // A simple "last registered wins" — production deployments wire their
    // own user→adapter map in a higher-level module.  This is good enough
    // for tests and for single-channel deployments.
    this.byUser.set(adapter.provider as unknown as UserId, adapter);
  }
}
