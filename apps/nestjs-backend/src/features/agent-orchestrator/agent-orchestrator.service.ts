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
import { PrismaService } from '@teable/db-main-prisma';
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

  /**
   * Streaming variant. Yields raw text deltas in arrival order. The
   * orchestrator concatenates them to persist one assistant message in the
   * conversation store; HTTP adapters pipe the same deltas to the client.
   *
   * Returning the full text as a single chunk is a valid (and encouraged)
   * fallback implementation — it lets providers without streaming keep the
   * uniform interface contract.
   */
  stream?(args: {
    baseId?: string;
    system: string;
    messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    signal?: AbortSignal;
  }): AsyncIterable<string>;
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
    @Optional() @Inject(InstanceSkillService) private readonly instanceSkills?: InstanceSkillService,
    // V12 — PrismaService for real Cuppy memory persistence. Unit tests
    // use the PrismaService stub they already wire, so this isn't @Optional.
    @Optional() private readonly prisma?: PrismaService
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

  /**
   * R-AI-7 — streaming variant of `handle()`. Same routing + tool-execution
   * pipeline as `handle()` but the LLM call returns an `AsyncIterable<string>`
   * of text deltas. We:
   *   1. Persist the inbound user message immediately (same as `handle()`).
   *   2. Route the prompt + tools once up front (no mid-stream routing).
   *   3. Drain `this.llm.stream(...)` and concatenate the deltas.
   *   4. Pre-run `schema_query` if the router selected it — `handle()` does
   *      this too; keeping the two paths symmetric avoids surprising callers
   *      that mix streaming and non-streaming.
   *   5. Append one assistant message with the concatenated text.
   *
   * Tool calls from the streamed response are intentionally **not** awaited
   * mid-stream — tool execution is a side-effect and SSE clients expect a
   * forward-only text channel. If a tool is required to answer, the
   * non-streaming `handle()` path is the right choice; the streaming variant
   * is for direct chat replies where the LLM can answer from context.
   */
  async handleStream(
    conversationId: string,
    userId: string,
    inbound: InboundMessage,
    options: { signal?: AbortSignal } = {}
  ): Promise<{ text: string; deltas: number }> {
    const ctx = this.store.loadOrCreate(conversationId, userId, this.inboundBaseId(inbound));
    this.store.appendMessage(ctx, 'user', inbound.text);

    const routed = this.router
      ? await this.router.route({
          recent: ctx.messages.slice(-4).map((message) => message.content),
          text: inbound.text,
        })
      : { system: 'You are the teable assistant.', tools: [] };
    this.store.setActiveTools(ctx, routed.tools);

    if (routed.tools.includes('schema_query')) {
      await this.invokeTool('schema_query', {}, ctx, conversationId);
    }

    if (!this.llm) {
      throw new ServiceUnavailableException('Cuppy AI provider is not configured');
    }

    const toolSchemas = routed.tools
      .map((name) => this.tools.get(name))
      .filter((t): t is Tool => Boolean(t))
      .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

    const instanceSkillContext = this.instanceSkills
      ? await this.instanceSkills.enabledPromptContext()
      : '';

    let buffer = '';
    let deltas = 0;
    try {
      const stream = this.llm.stream
        ? this.llm.stream({
            baseId: this.inboundBaseId(inbound),
            system: instanceSkillContext
              ? `${routed.system}\n\n${instanceSkillContext}`
              : routed.system,
            messages: ctx.messages.map((message) => ({
              role: message.role === 'tool' ? 'user' : message.role,
              content: message.role === 'tool' ? `[tool result] ${message.content}` : message.content,
            })),
            tools: toolSchemas,
            executeTool: (name, args) => this.invokeTool(name, args, ctx, conversationId),
            signal: options.signal,
          })
        : null;

      if (!stream) {
        // Provider without stream() — fall back to chat() and yield a single chunk.
        const result = await this.llm.chat({
          baseId: this.inboundBaseId(inbound),
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
        buffer = result.text;
        deltas = 1;
      } else {
        for await (const delta of stream) {
          if (options.signal?.aborted) break;
          buffer += delta;
          deltas += 1;
        }
      }
    } catch {
      throw new ServiceUnavailableException('Cuppy AI provider is unavailable');
    }

    if (buffer.length > 0) {
      this.store.appendMessage(ctx, 'assistant', buffer);
    }
    return { text: buffer, deltas };
  }

  /** R-AI-7 — list all in-memory conversations belonging to a user. */
  listConversations(userId: string): Array<{
    conversationId: string;
    baseId?: string;
    messageCount: number;
    updatedAt: number;
  }> {
    return this.store.listByUser(userId).map((ctx) => ({
      conversationId: ctx.conversation_id,
      baseId: ctx.base_id,
      messageCount: ctx.messages.length,
      updatedAt: ctx.updated_at,
    }));
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
  // ───────────────────────── R-AI-1: Cloud AI 对话能力补齐 ─────────────────────────
  // Cuppy 对话状态分四个维度,全部复用 scratchpad 作为内存存储,不扩展 DDD 模型:
  //   scratchpad['_memory']     = Record<key, {value, createdAt}>
  //   scratchpad['_artifacts']  = Array<{id, name, kind, content, versions, createdAt}>
  //   scratchpad['_smart_level'] = 'low' | 'medium' | 'high'
  //   scratchpad['_node_refs']  = Array<{nodeId, kind, refId, label}>
  //   scratchpad['_files']      = Array<{fileId, name, mime, size, createdAt}>
  // 这是 best-minimal 改造,后续若需持久化可加 meta.cuppy_* 表。

  private ensureCtx(conversationId: string, userId: string): ConversationContext {
    return this.store.loadOrCreate(conversationId, userId);
  }

  private now(): string {
    return new Date().toISOString();
  }

  private randId(): string {
    return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
  }

  /** Memory management (Cloud '记忆' feature). */
  async getMemory(conversationId: string): Promise<Record<string, { value: string; createdAt: string }>> {
    // V12 — DB-backed read (falls back to in-memory if Prisma not wired).
    if (this.prisma?.cuppyMemory) {
      const rows = await this.prisma.cuppyMemory.findMany({ where: { conversationId } });
      const out: Record<string, { value: string; createdAt: string }> = {};
      for (const r of rows) {
        out[r.key] = { value: r.value, createdAt: r.createdAt.toISOString() };
      }
      // Also mirror to scratchpad so subsequent reads within this process are fast.
      const ctx = this.store.peek(conversationId);
      if (ctx) ctx.scratchpad['_memory'] = out;
      return out;
    }
    const ctx = this.store.peek(conversationId);
    if (!ctx) return {};
    const mem = (ctx.scratchpad['_memory'] as Record<string, { value: string; createdAt: string }>) || {};
    return mem;
  }

  async setMemory(conversationId: string, userId: string, key: string, value: string): Promise<{ key: string; createdAt: string }> {
    const createdAt = this.now();
    if (this.prisma?.cuppyMemory) {
      const id = 'mem_' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
      await this.prisma.cuppyMemory.upsert({
        where: { conversationId_key: { conversationId, key } },
        create: { id, conversationId, key, value, createdBy: userId },
        update: { value, updatedAt: new Date() },
      });
      // Mirror to scratchpad so subsequent reads in this process are fast.
      const ctx = this.ensureCtx(conversationId, userId);
      const mem = (ctx.scratchpad['_memory'] as Record<string, { value: string; createdAt: string }>) || {};
      mem[key] = { value, createdAt };
      ctx.scratchpad['_memory'] = mem;
      this.store.setScratchpad(ctx, '_memory', mem);
      return { key, createdAt };
    }
    const ctx = this.ensureCtx(conversationId, userId);
    const mem = (ctx.scratchpad['_memory'] as Record<string, { value: string; createdAt: string }>) || {};
    mem[key] = { value, createdAt };
    ctx.scratchpad['_memory'] = mem;
    this.store.setScratchpad(ctx, '_memory', mem);
    return { key, createdAt };
  }

  async clearMemory(conversationId: string, userId: string, key?: string): Promise<{ cleared: number }> {
    if (this.prisma?.cuppyMemory) {
      const out = await this.prisma.cuppyMemory.deleteMany({
        where: key
          ? { conversationId, key: { in: [key] } }
          : { conversationId },
      });
      const ctx = this.store.peek(conversationId);
      if (ctx) {
        ctx.scratchpad['_memory'] = {};
        this.store.setScratchpad(ctx, '_memory', {});
      }
      return { cleared: out.count };
    }
    const ctx = this.ensureCtx(conversationId, userId);
    if (!key) {
      const before = Object.keys((ctx.scratchpad['_memory'] as object) || {}).length;
      ctx.scratchpad['_memory'] = {};
      this.store.setScratchpad(ctx, '_memory', {});
      return { cleared: before };
    }
    const mem = (ctx.scratchpad['_memory'] as Record<string, unknown>) || {};
    const had = key in mem;
    delete mem[key];
    ctx.scratchpad['_memory'] = mem;
    this.store.setScratchpad(ctx, '_memory', mem);
    return { cleared: had ? 1 : 0 };
  }

  /** Artifact management (Cloud 'Artifact' feature — chart/report/card with versions). */
  async listArtifacts(conversationId: string): Promise<Array<{ id: string; name: string; kind: string; versions: number; createdAt: string; shared: boolean }>> {
    if (this.prisma?.cuppyArtifact) {
      const rows = await this.prisma.cuppyArtifact.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        versions: Array.isArray(r.versions as unknown[]) ? (r.versions as unknown[]).length : 1,
        createdAt: r.createdAt.toISOString(),
        shared: r.shared,
      }));
    }
    const ctx = this.store.peek(conversationId);
    if (!ctx) return [];
    const arr = (ctx.scratchpad['_artifacts'] as Array<Record<string, unknown>>) || [];
    return arr.map((a) => ({
      id: String(a['id']),
      name: String(a['name']),
      kind: String(a['kind']),
      versions: Array.isArray(a['versions']) ? (a['versions'] as unknown[]).length : 1,
      createdAt: String(a['createdAt']),
      shared: Boolean(a['shared']),
    }));
  }

  async addArtifact(
    conversationId: string,
    userId: string,
    input: { name: string; kind: string; content: string }
  ): Promise<{ id: string; name: string; kind: string; versions: number; createdAt: string }> {
    const id = this.randId();
    const createdAt = this.now();
    const versions = [{ version: 1, content: input.content, createdAt }];
    if (this.prisma?.cuppyArtifact) {
      const row = await this.prisma.cuppyArtifact.create({
        data: {
          id,
          conversationId,
          name: input.name,
          kind: input.kind,
          content: input.content,
          versions: versions as unknown as object,
          shared: false,
          createdBy: userId,
        },
      });
      return { id: row.id, name: row.name, kind: row.kind, versions: 1, createdAt: row.createdAt.toISOString() };
    }
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_artifacts'] as Array<Record<string, unknown>>) || [];
    arr.push({
      id,
      name: input.name,
      kind: input.kind,
      content: input.content,
      versions,
      createdAt,
      shared: false,
    });
    ctx.scratchpad['_artifacts'] = arr;
    this.store.setScratchpad(ctx, '_artifacts', arr);
    return { id, name: input.name, kind: input.kind, versions: 1, createdAt };
  }

  async getArtifact(conversationId: string, artifactId: string): Promise<Record<string, unknown> | null> {
    if (this.prisma?.cuppyArtifact) {
      const row = await this.prisma.cuppyArtifact.findFirst({
        where: { id: artifactId, conversationId },
      });
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        kind: row.kind,
        content: row.content,
        versions: row.versions,
        shared: row.shared,
        createdAt: row.createdAt.toISOString(),
      } as Record<string, unknown>;
    }
    const ctx = this.store.peek(conversationId);
    if (!ctx) return null;
    const arr = (ctx.scratchpad['_artifacts'] as Array<Record<string, unknown>>) || [];
    return arr.find((a) => a['id'] === artifactId) ?? null;
  }

  async appendArtifactVersion(
    conversationId: string,
    userId: string,
    artifactId: string,
    content: string
  ): Promise<{ id: string; versions: number } | null> {
    if (this.prisma?.cuppyArtifact) {
      const row = await this.prisma.cuppyArtifact.findFirst({ where: { id: artifactId, conversationId } });
      if (!row) return null;
      const versions = Array.isArray(row.versions as unknown[]) ? [...(row.versions as Array<Record<string, unknown>>)] : [];
      versions.push({ version: versions.length + 1, content, createdAt: this.now() });
      await this.prisma.cuppyArtifact.update({
        where: { id: artifactId },
        data: { versions: versions as unknown as object, content },
      });
      return { id: artifactId, versions: versions.length };
    }
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_artifacts'] as Array<Record<string, unknown>>) || [];
    const a = arr.find((x) => x['id'] === artifactId);
    if (!a) return null;
    const versions = (a['versions'] as Array<Record<string, unknown>>) || [];
    versions.push({ version: versions.length + 1, content, createdAt: this.now() });
    a['versions'] = versions;
    a['content'] = content;
    ctx.scratchpad['_artifacts'] = arr;
    this.store.setScratchpad(ctx, '_artifacts', arr);
    return { id: artifactId, versions: versions.length };
  }

  async deleteArtifact(conversationId: string, userId: string, artifactId: string): Promise<boolean> {
    if (this.prisma?.cuppyArtifact) {
      const out = await this.prisma.cuppyArtifact.deleteMany({
        where: { id: artifactId, conversationId },
      });
      return out.count > 0;
    }
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_artifacts'] as Array<Record<string, unknown>>) || [];
    const next = arr.filter((a) => a['id'] !== artifactId);
    ctx.scratchpad['_artifacts'] = next;
    this.store.setScratchpad(ctx, '_artifacts', next);
    return next.length < arr.length;
  }

  async shareArtifact(conversationId: string, userId: string, artifactId: string, on: boolean): Promise<{ id: string; shared: boolean } | null> {
    if (this.prisma?.cuppyArtifact) {
      const row = await this.prisma.cuppyArtifact.findFirst({ where: { id: artifactId, conversationId } });
      if (!row) return null;
      await this.prisma.cuppyArtifact.update({ where: { id: artifactId }, data: { shared: on } });
      return { id: artifactId, shared: on };
    }
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_artifacts'] as Array<Record<string, unknown>>) || [];
    const a = arr.find((x) => x['id'] === artifactId);
    if (!a) return null;
    a['shared'] = on;
    ctx.scratchpad['_artifacts'] = arr;
    this.store.setScratchpad(ctx, '_artifacts', arr);
    return { id: artifactId, shared: on };
  }

  /** Smart level (Cloud '智能' menu). */
  getSmartLevel(conversationId: string): string {
    const ctx = this.store.peek(conversationId);
    if (!ctx) return 'medium';
    return String(ctx.scratchpad['_smart_level'] ?? 'medium');
  }

  setSmartLevel(conversationId: string, userId: string, level: string): { level: string } {
    const ctx = this.ensureCtx(conversationId, userId);
    ctx.scratchpad['_smart_level'] = level;
    this.store.setScratchpad(ctx, '_smart_level', level);
    return { level };
  }

  /** @-node references (Cloud '@' to attach tables/views/apps/automations/folders). */
  async listNodeRefs(conversationId: string): Promise<Array<{ nodeId: string; kind: string; refId: string; label: string; addedAt: string }>> {
    if (this.prisma?.cuppyNodeRef) {
      const rows = await this.prisma.cuppyNodeRef.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map((r) => ({
        nodeId: r.id,
        kind: r.kind,
        refId: r.refId,
        label: r.label,
        addedAt: r.createdAt.toISOString(),
      }));
    }
    const ctx = this.store.peek(conversationId);
    if (!ctx) return [];
    return (ctx.scratchpad['_node_refs'] as Array<{
      nodeId: string;
      kind: string;
      refId: string;
      label: string;
      addedAt: string;
    }>) || [];
  }

  async addNodeRef(
    conversationId: string,
    userId: string,
    input: { kind: string; refId: string; label: string }
  ): Promise<{ nodeId: string; kind: string; refId: string; label: string; addedAt: string }> {
    if (this.prisma?.cuppyNodeRef) {
      const id = this.randId();
      const row = await this.prisma.cuppyNodeRef.create({
        data: {
          id,
          conversationId,
          kind: input.kind,
          refId: input.refId,
          label: input.label,
          createdBy: userId,
        },
      });
      return {
        nodeId: row.id,
        kind: row.kind,
        refId: row.refId,
        label: row.label,
        addedAt: row.createdAt.toISOString(),
      };
    }
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_node_refs'] as Array<Record<string, unknown>>) || [];
    const nodeId = this.randId();
    const entry = { nodeId, kind: input.kind, refId: input.refId, label: input.label, addedAt: this.now() };
    arr.push(entry);
    ctx.scratchpad['_node_refs'] = arr;
    this.store.setScratchpad(ctx, '_node_refs', arr);
    return entry;
  }

  async removeNodeRef(conversationId: string, userId: string, nodeId: string): Promise<boolean> {
    if (this.prisma?.cuppyNodeRef) {
      const out = await this.prisma.cuppyNodeRef.deleteMany({
        where: { id: nodeId, conversationId },
      });
      return out.count > 0;
    }
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_node_refs'] as Array<Record<string, unknown>>) || [];
    const next = arr.filter((n) => n['nodeId'] !== nodeId);
    ctx.scratchpad['_node_refs'] = next;
    this.store.setScratchpad(ctx, '_node_refs', next);
    return next.length < arr.length;
  }

  /** File attachments (Cloud '上传文件' / '文件管理'). */
  listFiles(conversationId: string): Array<{ fileId: string; name: string; mime: string; size: number; createdAt: string }> {
    const ctx = this.store.peek(conversationId);
    if (!ctx) return [];
    return (ctx.scratchpad['_files'] as Array<{
      fileId: string;
      name: string;
      mime: string;
      size: number;
      createdAt: string;
    }>) || [];
  }

  addFile(
    conversationId: string,
    userId: string,
    input: { name: string; mime: string; size: number }
  ): { fileId: string; name: string; mime: string; size: number; createdAt: string } {
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_files'] as Array<Record<string, unknown>>) || [];
    const fileId = this.randId();
    const entry = { fileId, name: input.name, mime: input.mime, size: input.size, createdAt: this.now() };
    arr.push(entry);
    ctx.scratchpad['_files'] = arr;
    this.store.setScratchpad(ctx, '_files', arr);
    return entry;
  }

  removeFile(conversationId: string, userId: string, fileId: string): boolean {
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_files'] as Array<Record<string, unknown>>) || [];
    const next = arr.filter((f) => f['fileId'] !== fileId);
    ctx.scratchpad['_files'] = next;
    this.store.setScratchpad(ctx, '_files', next);
    return next.length < arr.length;
  }

  /** Available models list (Cloud '模型' menu). */
  listModels(): Array<{ id: string; label: string; tier: 'lite' | 'standard' | 'pro' }> {
    return [
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', tier: 'lite' },
      { id: 'gpt-4o', label: 'GPT-4o', tier: 'standard' },
      { id: 'o1-mini', label: 'o1-mini', tier: 'standard' },
      { id: 'o1', label: 'o1', tier: 'pro' },
      { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', tier: 'pro' },
    ];
  }
}
