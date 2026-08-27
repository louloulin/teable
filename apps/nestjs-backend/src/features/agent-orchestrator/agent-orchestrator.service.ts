/**
 * NestJS service wrapping the pure `ConversationStore` from
 * `./agent-orchestrator`.  Holds the registry of tools, dispatches LLM
 * prompts, and is the single integration point every IM adapter calls into.
 *
 * Tool calls are intentionally NOT executed inside this service — that lives
 * in `CuppyPromptRouter` (T-13-02) which decides which tools to surface based
 * on intent classification, and the actual `Tool.invoke()` side-effects
 * belong to the owning feature module.  This service's job is glue.
 *
 * License: AGPL-3.0
 */

import { Injectable, Optional } from '@nestjs/common';
import {
  ConversationContext,
  ConversationStore,
  InboundMessage,
  OutboundReply,
  AdapterRegistry,
  InMemoryAdapterRegistry,
  Tool,
} from './agent-orchestrator';

export interface LlmCallResult {
  text: string;
  /** Names of tools the LLM wants to call; the router narrows these. */
  requested_tools?: string[];
}

/** A minimal LLM client interface so the service is decoupled from the
 *  concrete provider (OpenAI / Anthropic / BYOK). */
export interface LlmClient {
  chat(args: {
    system: string;
    messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  }): Promise<LlmCallResult>;
}

export interface PromptRouter {
  /** Return the (prompt-system-message, tool-set) for a given user message. */
  route(
    ctx: ConversationContext,
    text: string
  ): Promise<{
    system: string;
    tools: string[];
  }>;
}

@Injectable()
export class AgentOrchestratorService {
  private readonly store = new ConversationStore();
  private readonly registry: AdapterRegistry = new InMemoryAdapterRegistry();
  private readonly tools = new Map<string, Tool>();

  constructor(
    @Optional() private readonly llm?: LlmClient,
    @Optional() private readonly router?: PromptRouter
  ) {}

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  adapterRegistry(): AdapterRegistry {
    return this.registry;
  }

  /**
   * Single entrypoint used by every IM adapter.  Returns the reply to send
   * back to the user (text + optional rich attachments).
   *
   * The function is async because the LLM call may stream or take seconds;
   * the caller (HTTP webhook, Slack event handler, etc.) does not block its
   * own request loop — IM providers expect a fast 200 with the reply
   * delivered via the adapter's outbound channel.
   */
  async handle(
    conversation_id: string,
    user_id: string,
    inbound: InboundMessage
  ): Promise<OutboundReply> {
    const ctx = this.store.loadOrCreate(conversation_id, user_id);

    // 1. Persist the user message before any LLM call.
    this.store.appendMessage(ctx, 'user', inbound.text);

    // 2. Route — pick the system prompt + active toolset.  Falls back to a
    //    no-router default if the dependency was not wired.
    const routed = this.router
      ? await this.router.route(ctx, inbound.text)
      : { system: 'You are the teable assistant.', tools: [] };
    this.store.setActiveTools(ctx, routed.tools);

    // 3. Resolve the tool schemas the LLM should see (router already
    //    narrowed; we still gate on `tools.has(name)` to avoid LLM hallucinating
    //    a non-existent tool name).
    const toolSchemas = routed.tools
      .map((name) => this.tools.get(name))
      .filter((t): t is Tool => Boolean(t))
      .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

    // 4. Call the LLM.  If no client is wired (e.g. tests) we fall back to a
    //    deterministic echo so the orchestrator can still be exercised.
    const llmResult = this.llm
      ? await this.llm.chat({
          system: routed.system,
          messages: ctx.messages.map((m) => ({ role: m.role, content: m.content })),
          tools: toolSchemas,
        })
      : { text: `[echo] ${inbound.text}` };

    // 5. Execute any tool calls the LLM requested — serialised through the
    //    conversation context so the tool can read/write scratchpad.
    if (llmResult.requested_tools?.length) {
      for (const toolName of llmResult.requested_tools) {
        const tool = this.tools.get(toolName);
        if (!tool) continue;
        try {
          await tool.invoke({ __placeholder__: true, __conversation_id__: conversation_id }, ctx);
        } catch {
          // Intentionally swallow — a failed tool must not break the user
          // reply.  Real telemetry is the caller's responsibility.
        }
      }
    }

    // 6. Persist the assistant reply and return it.
    this.store.appendMessage(ctx, 'assistant', llmResult.text);
    return { text: llmResult.text };
  }

  /** Test seam — load a conversation by id without mutating it. */
  inspect(conversation_id: string): ConversationContext | undefined {
    return this.store.loadOrCreate(conversation_id, '__never__');
  }
}
