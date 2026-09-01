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
import { SkillScopeService } from '../skill-scope/skill-scope.service';
import type { ScopedSkill } from '../skill-scope/skill-scope.types';
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
   * Streaming variant — yields text deltas as they arrive from the provider
   * and a final accumulated value when complete. Implementations that do not
   * have a real upstream (built-in echo) should emit the entire text in one
   * or two deltas followed by the closing chunk.
   */
  /** Backward-compat alias — older callers/tests reference `stream`. */
  stream?(args: {
    baseId?: string;
    system: string;
    messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    abortSignal?: AbortSignal;
  }): AsyncGenerator<{ delta: string; value?: string; done: boolean }>;
  chatStream?(args: {
    baseId?: string;
    system: string;
    messages: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
    executeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
    abortSignal?: AbortSignal;
  }): AsyncGenerator<{ delta: string; value?: string; done: boolean }>;
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
    @Optional() @Inject(SkillScopeService) private readonly scopedSkills?: SkillScopeService
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
      // R-AI-3e: pull instance skills (admin-curated, applies to everyone)
      // and 3-layer scoped skills (personal → base → space, narrow-wins).
      // Both are concatenated into the system prompt so the model has the
      // full skill context for the active user + base.
      const instanceSkillContext = this.instanceSkills
        ? await this.instanceSkills.enabledPromptContext()
        : '';
      const scopedSkillContext = this.scopedSkills
        ? await this.buildScopedSkillPrompt({
            userId: inbound.user_id,
            baseId: inboundBaseId,
          })
        : '';
      const skillContext = [instanceSkillContext, scopedSkillContext]
        .filter((s) => s.length > 0)
        .join('\n\n');
      llmResult = await this.llm.chat({
        baseId: inboundBaseId,
        system: skillContext ? `${routed.system}\n\n${skillContext}` : routed.system,
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
   * R-AI-11: Streaming variant of handle(). Mirrors the orchestration:
   * persist user message → route → preload schema → resolve skills → call
   * the LLM (streaming) → execute requested tools → persist assistant
   * reply. Tool execution stays after the stream finishes so the user sees
   * the assistant text first and tool side-effects land on completion.
   *
   * Yields `{delta, done, value}` chunks. The full accumulated value is
   * emitted on the final chunk (done=true). Cancellation is honored via
   * `abortSignal`; if the provider doesn't support it, the caller is still
   * expected to drop the iterator.
   */
  async *chatStream(
    conversationId: string,
    userId: string,
    inbound: InboundMessage,
    abortSignal?: AbortSignal
  ): AsyncGenerator<{ delta: string; value?: string; done: boolean }> {
    const inboundBaseId = this.inboundBaseId(inbound);
    const ctx = this.store.loadOrCreate(conversationId, userId, inboundBaseId);
    if (inboundBaseId) ctx.base_id = inboundBaseId;
    this.store.appendMessage(ctx, 'user', inbound.text);

    const routed = this.router
      ? await this.router.route({
          recent: ctx.messages.slice(-4).map((m) => m.content),
          text: inbound.text,
        })
      : { system: 'You are the teable assistant.', tools: [] };
    this.store.setActiveTools(ctx, routed.tools);

    const toolSchemas = routed.tools
      .map((name) => this.tools.get(name))
      .filter((t): t is Tool => Boolean(t))
      .map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

    if (routed.tools.includes('schema_query')) {
      await this.invokeTool('schema_query', {}, ctx, conversationId);
    }

    const instanceSkillContext = this.instanceSkills
      ? await this.instanceSkills.enabledPromptContext()
      : '';
    const scopedSkillContext = this.scopedSkills
      ? await this.buildScopedSkillPrompt({
          userId: inbound.user_id,
          baseId: inboundBaseId,
        })
      : '';
    const skillContext = [instanceSkillContext, scopedSkillContext]
      .filter((s) => s.length > 0)
      .join('\n\n');

    let llmStream: AsyncGenerator<{ delta: string; value?: string; done: boolean }> | undefined;
    const streamImpl = this.llm?.chatStream ?? this.llm?.stream;
    if (streamImpl) {
      llmStream = streamImpl({
        baseId: inboundBaseId,
        system: skillContext ? `${routed.system}\n\n${skillContext}` : routed.system,
        messages: ctx.messages.map((m) => ({
          role: m.role === 'tool' ? 'user' : m.role,
          content: m.role === 'tool' ? `[tool result] ${m.content}` : m.content,
        })),
        tools: toolSchemas,
        executeTool: (name, args) => this.invokeTool(name, args, ctx, conversationId),
        abortSignal,
      });
    } else {
      // Fallback: derive a deterministic streamed echo from the synchronous
      // chat result. Keeps callers responsive even without a real provider.
      const result = this.llm
        ? await this.llm.chat({
            baseId: inboundBaseId,
            system: skillContext ? `${routed.system}\n\n${skillContext}` : routed.system,
            messages: ctx.messages.map((m) => ({
              role: m.role === 'tool' ? 'user' : m.role,
              content: m.role === 'tool' ? `[tool result] ${m.content}` : m.content,
            })),
            tools: toolSchemas,
            executeTool: (name, args) => this.invokeTool(name, args, ctx, conversationId),
          })
        : { text: 'Cuppy AI provider is not configured.' };
      llmStream = (async function* () {
        yield { delta: result.text, done: true, value: result.text };
      })();
    }

    let accumulated = '';
    for await (const chunk of llmStream) {
      if (abortSignal?.aborted) return;
      if (chunk.delta) accumulated += chunk.delta;
      yield chunk;
      if (chunk.done) break;
    }

    this.store.appendMessage(ctx, 'assistant', accumulated);
  }

  /**
   * Backward-compat alias of {@link chatStream} — older tests reference
   * `stream`. Both names share the same signature.
   */
  async *stream(
    conversationId: string,
    userId: string,
    inbound: InboundMessage,
    abortSignal?: AbortSignal
  ): AsyncGenerator<{ delta: string; value?: string; done: boolean }> {
    yield* this.chatStream(conversationId, userId, inbound, abortSignal);
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
  getMemory(conversationId: string): Record<string, { value: string; createdAt: string }> {
    const ctx = this.store.peek(conversationId);
    if (!ctx) return {};
    const mem = (ctx.scratchpad['_memory'] as Record<string, { value: string; createdAt: string }>) || {};
    return mem;
  }

  setMemory(conversationId: string, userId: string, key: string, value: string): { key: string; createdAt: string } {
    const ctx = this.ensureCtx(conversationId, userId);
    const mem = (ctx.scratchpad['_memory'] as Record<string, { value: string; createdAt: string }>) || {};
    const createdAt = this.now();
    mem[key] = { value, createdAt };
    ctx.scratchpad['_memory'] = mem;
    this.store.setScratchpad(ctx, '_memory', mem);
    return { key, createdAt };
  }

  clearMemory(conversationId: string, userId: string, key?: string): { cleared: number } {
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
  listArtifacts(conversationId: string): Array<{ id: string; name: string; kind: string; versions: number; createdAt: string; shared: boolean }> {
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

  addArtifact(
    conversationId: string,
    userId: string,
    input: { name: string; kind: string; content: string }
  ): { id: string; name: string; kind: string; versions: number; createdAt: string } {
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_artifacts'] as Array<Record<string, unknown>>) || [];
    const id = this.randId();
    const createdAt = this.now();
    arr.push({
      id,
      name: input.name,
      kind: input.kind,
      content: input.content,
      versions: [{ version: 1, content: input.content, createdAt }],
      createdAt,
      shared: false,
    });
    ctx.scratchpad['_artifacts'] = arr;
    this.store.setScratchpad(ctx, '_artifacts', arr);
    return { id, name: input.name, kind: input.kind, versions: 1, createdAt };
  }

  getArtifact(conversationId: string, artifactId: string): Record<string, unknown> | null {
    const ctx = this.store.peek(conversationId);
    if (!ctx) return null;
    const arr = (ctx.scratchpad['_artifacts'] as Array<Record<string, unknown>>) || [];
    return arr.find((a) => a['id'] === artifactId) ?? null;
  }

  appendArtifactVersion(
    conversationId: string,
    userId: string,
    artifactId: string,
    content: string
  ): { id: string; versions: number } | null {
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

  deleteArtifact(conversationId: string, userId: string, artifactId: string): boolean {
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_artifacts'] as Array<Record<string, unknown>>) || [];
    const next = arr.filter((a) => a['id'] !== artifactId);
    ctx.scratchpad['_artifacts'] = next;
    this.store.setScratchpad(ctx, '_artifacts', next);
    return next.length < arr.length;
  }

  shareArtifact(conversationId: string, userId: string, artifactId: string, on: boolean): { id: string; shared: boolean } | null {
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
  listNodeRefs(conversationId: string): Array<{ nodeId: string; kind: string; refId: string; label: string; addedAt: string }> {
    const ctx = this.store.peek(conversationId);
    if (!ctx) return [];
    return (ctx.scratchpad['_node_refs'] as Array<Record<string, unknown>>) || [];
  }

  addNodeRef(
    conversationId: string,
    userId: string,
    input: { kind: string; refId: string; label: string }
  ): { nodeId: string; kind: string; refId: string; label: string; addedAt: string } {
    const ctx = this.ensureCtx(conversationId, userId);
    const arr = (ctx.scratchpad['_node_refs'] as Array<Record<string, unknown>>) || [];
    const nodeId = this.randId();
    const entry = { nodeId, kind: input.kind, refId: input.refId, label: input.label, addedAt: this.now() };
    arr.push(entry);
    ctx.scratchpad['_node_refs'] = arr;
    this.store.setScratchpad(ctx, '_node_refs', arr);
    return entry;
  }

  removeNodeRef(conversationId: string, userId: string, nodeId: string): boolean {
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
    return (ctx.scratchpad['_files'] as Array<Record<string, unknown>>) || [];
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
  /**
   * R-AI-3e: format the 3-layer scoped skills as a system-prompt section.
   * Returns an empty string when no skills are configured or when the
   * service is not wired (e.g. tests).
   */
  private async buildScopedSkillPrompt(ctx: {
    userId: string;
    baseId?: string;
  }): Promise<string> {
    if (!this.scopedSkills) return '';
    let resolved;
    try {
      resolved = await this.scopedSkills.resolve(ctx);
    } catch {
      return '';
    }
    const formatBucket = (label: string, skills: ScopedSkill[]): string[] => {
      if (skills.length === 0) return [];
      const lines = skills.map(
        (s) => `- [${s.scope}] ${s.name}: ${s.description}\n  ${s.content}`
      );
      return [`${label} (${skills.length}):`, ...lines];
    };
    const sections = [
      formatBucket('Personal skills', resolved.personal),
      formatBucket('Base skills', resolved.base),
      formatBucket('Space skills', resolved.space),
    ].filter((s) => s.length > 0);
    if (sections.length === 0) return '';
    return [
      'The following scoped skills are available for this conversation. ' +
        'Apply the most specific (narrow) scope first: personal > base > space > instance.',
      ...sections,
    ].join('\n');
  }


}
