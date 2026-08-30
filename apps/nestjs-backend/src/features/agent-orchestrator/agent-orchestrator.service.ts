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

import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { CuppyPromptRouter } from '../cuppy-prompt-router/cuppy-prompt-router';
import { InstanceSkillService } from '../instance-skills/instance-skill.service';
import type {
  ConversationContext,
  InboundMessage,
  OutboundReply,
  AdapterRegistry,
  Tool,
} from './agent-orchestrator';
import { ConversationStore, InMemoryAdapterRegistry } from './agent-orchestrator';

export interface ILlmCallResult {
  text: string;
  /** Tool calls returned by a lightweight/mock provider. */
  requestedTools?: Array<string | { name: string; args?: Record<string, unknown> }>;
}

/** A minimal LLM client interface so the service is decoupled from the
 *  concrete provider (OpenAI / Anthropic / BYOK). */
export interface ILlmClient {
  chat(args: {
    baseId?: string;
    system: string;
    messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  }): Promise<ILlmCallResult>;
}

export interface IPromptRouter {
  /** Return the (prompt-system-message, tool-set) for a given user message. */
  route(args: { recent: string[]; text: string }): Promise<{ system: string; tools: string[] }>;
}

@Injectable()
export class AgentOrchestratorService {
  private readonly store = new ConversationStore();
  private readonly registry: AdapterRegistry = new InMemoryAdapterRegistry();
  private readonly tools = new Map<string, Tool>();

  constructor(
    @Optional() @Inject('CUPPY_LLM_CLIENT') private readonly llm?: ILlmClient,
    @Optional() @Inject(CuppyPromptRouter) private readonly router?: IPromptRouter,
    @Optional() @Inject(InstanceSkillService) private readonly instanceSkills?: InstanceSkillService
  ) {}

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  reset(conversationId: string): boolean {
    return this.store.reset(conversationId);
  }

  stats(): { conversations: number; tools: number } {
    return { conversations: this.store.size(), tools: this.tools.size };
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
    conversationId: string,
    userId: string,
    inbound: InboundMessage
  ): Promise<OutboundReply> {
    const inboundBaseId = this.inboundBaseId(inbound);
    const ctx = this.store.loadOrCreate(conversationId, userId, inboundBaseId);
    if (inboundBaseId) ctx.base_id = inboundBaseId;

    // 1. Persist the user message before any LLM call.
    this.store.appendMessage(ctx, 'user', inbound.text);

    // 2. Route — pick the system prompt + active toolset.  Falls back to a
    //    no-router default if the dependency was not wired.
    const routed = this.router
      ? await this.router.route({
          recent: ctx.messages.slice(-4).map((message) => message.content),
          text: inbound.text,
        })
      : { system: 'You are the teable assistant.', tools: [] };
    this.store.setActiveTools(ctx, routed.tools);

    // 3. Resolve the tool schemas the LLM should see (router already
    //    narrowed; we still gate on `tools.has(name)` to avoid LLM hallucinating
    //    a non-existent tool name).
    const toolSchemas = routed.tools
      .map((name) => this.tools.get(name))
      .filter((t): t is Tool => Boolean(t))
      .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

    // Schema questions are safe, deterministic reads.  Run the selected
    // schema tool before the model call so providers that do not reliably emit
    // tool calls still receive live, permission-checked workspace context.
    if (routed.tools.includes('schema_query')) {
      await this.invokeTool('schema_query', {}, ctx, conversationId);
    }

    // 4. Call the configured LLM. Tests inject a fake client explicitly.
    let llmResult: ILlmCallResult;
    if (!this.llm) {
      throw new ServiceUnavailableException('Cuppy AI provider is not configured');
    }
    try {
      const instanceSkillContext = this.instanceSkills
        ? await this.instanceSkills.enabledPromptContext()
        : '';
      llmResult = await this.llm.chat({
        baseId: inboundBaseId,
        system: instanceSkillContext
          ? `${routed.system}\n\n${instanceSkillContext}`
          : routed.system,
        messages: ctx.messages.map((message) => ({
          role: message.role === 'tool' ? 'user' : message.role,
          content: message.role === 'tool' ? `[tool result] ${message.content}` : message.content,
        })),
        tools: toolSchemas,
        executeTool: (name, args) => this.invokeTool(name, args, ctx, conversationId),
      });
    } catch {
      throw new ServiceUnavailableException('Cuppy AI provider is unavailable');
    }

    // 5. Execute any tool calls the LLM requested — serialised through the
    //    conversation context so the tool can read/write scratchpad.
    for (const requestedTool of llmResult.requestedTools ?? []) {
      const toolCall =
        typeof requestedTool === 'string'
          ? { name: requestedTool, args: {} }
          : { name: requestedTool.name, args: requestedTool.args ?? {} };
      await this.invokeTool(toolCall.name, toolCall.args, ctx, conversationId);
    }

    // 6. Persist the assistant reply and return it.
    this.store.appendMessage(ctx, 'assistant', llmResult.text);
    return { text: llmResult.text };
  }

  /** Test seam — load a conversation by id without mutating it. */
  inspect(conversationId: string): ConversationContext | undefined {
    return this.store.peek(conversationId);
  }

  private async invokeTool(
    name: string,
    args: Record<string, unknown>,
    ctx: ConversationContext,
    conversationId: string
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool || !ctx.active_tools.includes(name)) return undefined;
    try {
      const result = await tool.invoke({ ...args, __conversation_id__: conversationId }, ctx);
      this.store.appendMessage(ctx, 'tool', JSON.stringify({ name, result }));
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'tool execution failed';
      this.store.appendMessage(ctx, 'tool', JSON.stringify({ name, error: message }));
      return { error: message };
    }
  }

  private inboundBaseId(inbound: InboundMessage): string | undefined {
    const baseId = inbound.provider_meta?.baseId;
    return typeof baseId === 'string' && baseId.length > 0 ? baseId : undefined;
  }
}
