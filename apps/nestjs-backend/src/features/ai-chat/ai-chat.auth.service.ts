/**
 * AI Chat auth service (Stage 35–37 — Cloud §ai/ai-chat).
 *
 * Session store + message store with conversation memory (last 20 turns),
 * single-turn execution via the existing AiService, streaming via SSE, and
 * automatic table/view context injection when the session carries
 * `tableId` / `viewId`.
 */

import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { PermissionService } from '../auth/permission.service';
import { estimateTokens } from './ai-chat.helper';
import { AiChatContextService } from './ai-chat-context.service';
import { AiChatSkillService } from './ai-chat-skill.service';
import { AiChatMemoryService } from './ai-chat-memory.service';
import { AiChatPreferenceService } from './ai-chat-preference.service';
import { AiChatToolsService } from './ai-chat-tools.service';
import { AiChatArtifactService } from './ai-chat-artifact.service';
import { AiChatSmartLevelService } from './ai-chat-smart-level.service';
import { AiChatQueueService } from './ai-chat-queue.service';
import type {
  AiChatRole,
  IAddChatMessageInput,
  IAiChatMessage,
  IAiChatSession,
  IChatTurnInput,
  IChatTurnResult,
  ICreateChatSessionInput,
} from './ai-chat.types';
import { AiService } from '../ai/ai.service';
import { AiChatNodeRefService } from './ai-chat-node-ref.service';
import { AiChatAttachmentExtractor } from './ai-chat-attachment-extractor.service';
import { AiChatLlmService } from './ai-chat-llm.service';
import { decideLlmRoute, readFeatureFlag } from './ai-chat-llm-router';
import { getAiSetting } from '../ai-setting/ai-setting.auth.service';

const MAX_HISTORY_TURNS = 20;

@Injectable()
export class AiChatAuthService {
  private readonly logger = new Logger(AiChatAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ai?: AiService,
    @Optional() private readonly contextService?: AiChatContextService,
    @Optional() private readonly skillService?: AiChatSkillService,
    @Optional() private readonly memoryService?: AiChatMemoryService,
    @Optional() private readonly preferenceService?: AiChatPreferenceService,
    @Optional() private readonly toolsService?: AiChatToolsService,
    @Optional() private readonly artifactService?: AiChatArtifactService,
    @Optional() private readonly smartLevelService?: AiChatSmartLevelService,
    @Optional() private readonly queueService?: AiChatQueueService,
    @Optional() private readonly permissionService?: PermissionService,
    @Optional() private readonly nodeRefService?: AiChatNodeRefService,
    @Optional() private readonly attachmentExtractor?: AiChatAttachmentExtractor,
    @Optional() private readonly llmService?: AiChatLlmService
  ) {}

  async assertBaseReadable(baseId: string | null | undefined): Promise<void> {
    if (baseId && this.permissionService) {
      await this.permissionService.validPermissions(baseId, ['base|read']);
    }
  }

  private assertSessionOwner(session: { createdBy: string }, userId?: string): void {
    if (userId && session.createdBy !== userId) {
      throw new NotFoundException('chat session not found');
    }
  }

  private async findOwnedSession(sessionId: string, userId?: string) {
    const session = await this.prisma.aiChatSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException(`chat session not found: ${sessionId}`);
    this.assertSessionOwner(session, userId);
    await this.assertBaseReadable(session.baseId);
    return session;
  }

  async assertAccessible(sessionId: string, userId: string): Promise<void> {
    await this.findOwnedSession(sessionId, userId);
  }

  async createSession(input: ICreateChatSessionInput): Promise<IAiChatSession> {
    await this.assertBaseReadable(input.baseId);
    const id = `aics_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.aiChatSession.create({
      data: {
        id,
        baseId: input.baseId ?? null,
        tableId: input.tableId ?? null,
        viewId: input.viewId ?? null,
        title: input.title ?? null,
        model: input.model,
        createdBy: input.createdBy,
      },
    });
    return toSessionRow(row);
  }

  async listSessions(input: {
    baseId?: string;
    createdBy?: string;
    take?: number;
  }): Promise<IAiChatSession[]> {
    await this.assertBaseReadable(input.baseId);
    const rows = await this.prisma.aiChatSession.findMany({
      where: {
        ...(input.baseId ? { baseId: input.baseId } : {}),
        ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      },
      orderBy: { updatedTime: 'desc' },
      take: input.take ?? 50,
    });
    return rows.map(toSessionRow);
  }

  async getSession(sessionId: string, userId?: string): Promise<IAiChatSession | null> {
    const row = await this.prisma.aiChatSession.findUnique({ where: { id: sessionId } });
    if (row) {
      this.assertSessionOwner(row, userId);
      await this.assertBaseReadable(row.baseId);
    }
    return row ? toSessionRow(row) : null;
  }

  async deleteSession(sessionId: string, userId?: string): Promise<{ ok: true; id: string }> {
    await this.findOwnedSession(sessionId, userId);
    await this.prisma.aiChatSession.delete({ where: { id: sessionId } });
    return { ok: true, id: sessionId };
  }

  async listMessages(sessionId: string, take = 100, userId?: string): Promise<IAiChatMessage[]> {
    await this.findOwnedSession(sessionId, userId);
    const rows = await this.prisma.aiChatMessage.findMany({
      where: { sessionId },
      orderBy: { createdTime: 'asc' },
      take,
    });
    return rows.map(toMessageRow);
  }

  async addMessage(input: IAddChatMessageInput): Promise<IAiChatMessage> {
    const id = `aicm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.aiChatMessage.create({
      data: {
        id,
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        model: input.model ?? null,
        promptTokens: input.promptTokens ?? estimateTokens(input.content),
        completionTokens: input.completionTokens ?? 0,
        durationMs: input.durationMs ?? 0,
      },
    });
    // Touch session updatedTime
    await this.prisma.aiChatSession.update({
      where: { id: input.sessionId },
      data: { updatedTime: new Date() },
    });
    return toMessageRow(row);
  }

  /**
   * Build the system-prompt prefix that should be injected ahead of the
   * conversation history. Order of precedence:
   *   1. Caller-provided explicit `context` (e.g. UI-side hint).
   *   2. Auto-resolved table/view context from the session metadata.
   *   3. Empty string.
   */
  private async resolveContextPrefix(
    session: { tableId: string | null; viewId: string | null },
    explicitContext?: string
  ): Promise<string> {
    if (explicitContext && explicitContext.trim()) return explicitContext;
    if (!this.contextService || !session.tableId) return '';
    const ctx = await this.contextService.resolve({
      tableId: session.tableId,
      viewId: session.viewId,
    });
    return this.contextService.render(ctx);
  }

  /**
   * Resolve the skill system prompt for a user message. Returns null when
   * the message does not start with `@<skill>`. The returned value also
   * carries the stripped remainder so it can be passed to the LLM as the
   * actual question.
   */
  private async resolveSkill(input: {
    userMessage: string;
    session: { baseId: string | null; tableId: string | null; viewId: string | null };
  }): Promise<{ skillName: string; remainder: string; systemPrompt: string } | null> {
    if (!this.skillService) return null;
    const match = this.skillService.match(input.userMessage);
    if (!match) return null;
    const systemPrompt = await this.skillService.buildPrompt({
      skill: match.skill,
      remainder: match.remainder,
      session: input.session,
    });
    return {
      skillName: match.skill.name,
      remainder: match.remainder || input.userMessage,
      systemPrompt,
    };
  }

  /**
   * Resolve the user's recent memory block for inclusion in the system
   * prompt. Returns an empty string when the memory service is absent
   * or the user has no prior sessions.
   */
  private async resolveMemory(input: { userId: string; baseId: string | null }): Promise<string> {
    if (!this.memoryService) return '';
    const memory = await this.memoryService.load({
      userId: input.userId,
      baseId: input.baseId,
    });
    return this.memoryService.render(memory);
  }

  /**
   * Resolve the caller's chat preferences as a prompt fragment.
   */
  /**
   * Stage 54 — resolve the effective smart level (reasoning intensity)
   * for a chat turn and render it as a prompt prefix.
   *
   * Resolution order (highest wins):
   *   1. `input.smartLevel` (per-turn override)
   *   2. `AiSetting.defaultSmartLevel` (global setting)
   *   3. 'medium' (hardcoded fallback)
   */
  /**
   * Stage 60 — after a chat turn completes, pop the next pending queued
   * message and re-run the same LLM pipeline with it. No-op when the
   * queue is empty. Errors during drain are logged, not propagated, so
   * they don't break the user-facing return value.
   */
  private async drainQueue(sessionId: string): Promise<void> {
    if (!this.queueService || !this.ai) return;
    try {
      const next = await this.queueService.popNextPending(sessionId);
      if (!next) return;
      try {
        // Reuse chatTurn on the queued message. We invoke the public method
        // so all the context/skill/memory/tools/smartLevel wiring fires.
        const result = await this.chatTurn({
          sessionId,
          userMessage: next.userMessage,
        });
        await this.queueService.markDone(next.id, result.assistantMessageId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.queueService.markFailed(next.id, message);
        this.logger.warn(`queue drain failed for ${next.id}: ${message}`);
      }
    } catch (error) {
      this.logger.warn(
        `drainQueue outer failure: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async resolveSmartLevel(input: {
    userId: string;
    override?: 'low' | 'medium' | 'high';
  }): Promise<string> {
    if (!this.smartLevelService) return '';
    try {
      const level = await this.smartLevelService.resolve(input.override);
      return this.smartLevelService.render(level);
    } catch (error) {
      this.logger.warn(
        `resolveSmartLevel failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return '';
    }
  }

  private async resolvePreferences(userId: string): Promise<string> {
    if (!this.preferenceService) return '';
    const prefs = await this.preferenceService.get(userId);
    return this.preferenceService.render(prefs);
  }

  /**
   * Single chat turn: append user message, call provider with conversation
   * history + auto-resolved table/view context, append assistant message,
   * return both. Uses AiService for the real LLM call so model/key
   * resolution matches AI Field.
   */
  async chatTurn(input: IChatTurnInput): Promise<IChatTurnResult> {
    if (!this.ai) {
      throw new Error('AI provider is not configured');
    }
    const session = await this.findOwnedSession(input.sessionId, input.userId);

    const history = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { createdTime: 'asc' },
      take: MAX_HISTORY_TURNS,
    });

    // Persist user message first
    const userMessage = await this.addMessage({
      sessionId: input.sessionId,
      role: 'user',
      content: input.userMessage,
    });

    const autoContext = await this.resolveContextPrefix(session, input.context);
    const attachmentBlock = input.attachmentIds?.length
      ? await this.attachmentExtractor?.resolveToTextBlock(input.attachmentIds)
      : '';
    const skill = await this.resolveSkill({ userMessage: input.userMessage, session });
    const memory = await this.resolveMemory({
      userId: session.createdBy,
      baseId: session.baseId,
    });
    const preferences = await this.resolvePreferences(session.createdBy);
    const nodeRefs = await this.resolveNodeRefs(input.sessionId, session.createdBy);
    const tools = await this.resolveTools({
      session: { baseId: session.baseId, tableId: session.tableId },
      userMessage: skill ? skill.remainder : input.userMessage,
    });
    const smartLevel = await this.resolveSmartLevel({
      userId: session.createdBy,
      override: input.smartLevel,
    });
    // Build prompt: optional skill preamble + context + tools + memory + preferences +
    // recent turns + current question.
    const prompt = this.buildPrompt({
      skillSystem: skill?.systemPrompt,
      context: [autoContext || input.context, nodeRefs, attachmentBlock].filter(Boolean).join('\n\n'),
      memory,
      preferences,
      tools,
      smartLevel,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      userMessage: skill ? skill.remainder : input.userMessage,
    });

    const startedAt = Date.now();
    const baseId = session.baseId ?? '';
    const text = await this.ai.generateText(baseId, { prompt, task: 'coding' as never });
    const durationMs = Date.now() - startedAt;
    const assistantContent = text.trim();

    const assistantMessage = await this.addMessage({
      sessionId: input.sessionId,
      role: 'assistant',
      content: assistantContent,
      model: session.model ?? undefined,
      promptTokens: estimateTokens(prompt),
      completionTokens: estimateTokens(assistantContent),
      durationMs,
    });

    // Stage 50 — auto-detect artifacts (mermaid / html / table) from the
    // assistant reply and persist them as independent viewer-ready artifacts.
    if (this.artifactService) {
      try {
        const detected = this.artifactService.detectFromMessage(assistantContent);
        for (const d of detected) {
          await this.artifactService.create({
            sessionId: input.sessionId,
            messageId: assistantMessage.id,
            format: d.format,
            title: d.title,
            content: d.content,
          });
        }
      } catch (error) {
        this.logger.warn(
          `artifact detection failed for session ${input.sessionId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }

    if (!session.title) {
      const titleFromMessage = input.userMessage.slice(0, 40).replace(/\s+/g, ' ').trim();
      if (titleFromMessage) {
        await this.prisma.aiChatSession.update({
          where: { id: input.sessionId },
          data: { title: titleFromMessage },
        });
      }
    }

    // Stage 60 — drain the next pending queued message (fire-and-forget).
    void this.drainQueue(input.sessionId);

    return {
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      assistantContent,
      promptTokens: estimateTokens(prompt),
      completionTokens: estimateTokens(assistantContent),
      durationMs,
      skillName: skill?.skillName,
    };
  }

  /**
   * Streaming chat turn: persists the user message first, then streams
   * assistant chunks via the existing AiService.generateTextStream.
   * Returns an async generator that yields `{delta, done}` chunks plus a
   * final `{done: true, userMessageId, assistantMessageId, ...}` event.
   */
  async *chatTurnStreaming(input: IChatTurnInput): AsyncGenerator<
    | { delta: string; done: false }
    | {
        delta: '';
        done: true;
        userMessageId: string;
        assistantMessageId: string;
        assistantContent: string;
        promptTokens: number;
        completionTokens: number;
        durationMs: number;
        skillName?: string;
      }
  > {
    if (!this.ai) {
      throw new Error('AI provider is not configured');
    }
    const session = await this.findOwnedSession(input.sessionId, input.userId);

    const history = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { createdTime: 'asc' },
      take: MAX_HISTORY_TURNS,
    });

    const userMessage = await this.addMessage({
      sessionId: input.sessionId,
      role: 'user',
      content: input.userMessage,
    });

    const autoContext = await this.resolveContextPrefix(session, input.context);
    const attachmentBlock = input.attachmentIds?.length
      ? await this.attachmentExtractor?.resolveToTextBlock(input.attachmentIds)
      : '';
    const skill = await this.resolveSkill({ userMessage: input.userMessage, session });
    const memory = await this.resolveMemory({
      userId: session.createdBy,
      baseId: session.baseId,
    });
    const preferences = await this.resolvePreferences(session.createdBy);
    const nodeRefs = await this.resolveNodeRefs(input.sessionId, session.createdBy);
    const tools = await this.resolveTools({
      session: { baseId: session.baseId, tableId: session.tableId },
      userMessage: skill ? skill.remainder : input.userMessage,
    });
    const smartLevel = await this.resolveSmartLevel({
      userId: session.createdBy,
      override: input.smartLevel,
    });

    const prompt = this.buildPrompt({
      skillSystem: skill?.systemPrompt,
      context: [autoContext || input.context, nodeRefs, attachmentBlock].filter(Boolean).join('\n\n'),
      memory,
      preferences,
      tools,
      smartLevel,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      userMessage: skill ? skill.remainder : input.userMessage,
    });

    const startedAt = Date.now();
    const baseId = session.baseId ?? '';

    // Use the lower-level ai.generateTextStream via .streamText() so we
    // get the same provider resolution as chatTurn().
    const stream = this.ai.generateTextStream(baseId, { prompt, task: 'coding' as never });
    let accumulated = '';
    for await (const chunk of stream) {
      if (chunk.delta) {
        accumulated += chunk.delta;
        yield { delta: chunk.delta, done: false };
      }
    }
    const durationMs = Date.now() - startedAt;
    const assistantContent = accumulated.trim();

    const assistantMessage = await this.addMessage({
      sessionId: input.sessionId,
      role: 'assistant',
      content: assistantContent,
      model: session.model ?? undefined,
      promptTokens: estimateTokens(prompt),
      completionTokens: estimateTokens(assistantContent),
      durationMs,
    });

    if (!session.title) {
      const titleFromMessage = input.userMessage.slice(0, 40).replace(/\s+/g, ' ').trim();
      if (titleFromMessage) {
        await this.prisma.aiChatSession.update({
          where: { id: input.sessionId },
          data: { title: titleFromMessage },
        });
      }
    }

    yield {
      delta: '',
      done: true,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      assistantContent,
      promptTokens: estimateTokens(prompt),
      completionTokens: estimateTokens(assistantContent),
      durationMs,
      skillName: skill?.skillName,
    };
  }

  /**
   * Rename an existing session. Returns the updated session or null when
   * the session does not exist.
   */
  async renameSession(input: {
    sessionId: string;
    title: string;
    userId?: string;
  }): Promise<IAiChatSession | null> {
    const trimmed = input.title.trim().slice(0, 120);
    if (!trimmed) return null;
    const existing = await this.prisma.aiChatSession.findUnique({ where: { id: input.sessionId } });
    if (!existing) return null;
    this.assertSessionOwner(existing, input.userId);
    const updated = await this.prisma.aiChatSession.update({
      where: { id: input.sessionId },
      data: { title: trimmed, updatedTime: new Date() },
    });
    return toSessionRow(updated);
  }

  /**
   * Fork a session from a given message index (inclusive). Creates a
   * new session carrying the same baseId/tableId/viewId/model and
   * copies the messages up to and including `upToMessageIndex`. The new
   * session's title is prefixed with "[Fork] " so users can spot it.
   *
   * Returns the new session id + the message copy count. Throws when
   * the source session does not exist.
   */
  async forkSession(input: {
    sourceSessionId: string;
    upToMessageIndex?: number;
    createdBy: string;
  }): Promise<{ newSessionId: string; copiedMessages: number }> {
    const source = await this.findOwnedSession(input.sourceSessionId, input.createdBy);

    const messages = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: input.sourceSessionId },
      orderBy: { createdTime: 'asc' },
    });
    const upToIndex = Math.min(
      Math.max(input.upToMessageIndex ?? messages.length - 1, 0),
      messages.length - 1
    );
    const slice = messages.slice(0, upToIndex + 1);

    const newId = `aics_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const forkTitle = `[Fork] ${source.title ?? 'untitled'}`.slice(0, 120);
    await this.prisma.aiChatSession.create({
      data: {
        id: newId,
        baseId: source.baseId,
        tableId: source.tableId,
        viewId: source.viewId,
        title: forkTitle,
        model: source.model,
        createdBy: input.createdBy,
      },
    });
    let copied = 0;
    for (const m of slice) {
      const newMessageId = `aicm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}_${copied}`;
      await this.prisma.aiChatMessage.create({
        data: {
          id: newMessageId,
          sessionId: newId,
          role: m.role,
          content: m.content,
          model: m.model,
          promptTokens: m.promptTokens,
          completionTokens: m.completionTokens,
          durationMs: m.durationMs,
        },
      });
      copied += 1;
    }
    return { newSessionId: newId, copiedMessages: copied };
  }

  /**
   * Regenerate the assistant turn for the latest user message. Deletes the
   * existing assistant message(s) that followed the user message and
   * re-runs the LLM call, returning the new assistant message id +
   * tokens. Useful for the "try again" UX.
   */
  async regenerateTurn(input: {
    sessionId: string;
    smartLevel?: 'low' | 'medium' | 'high';
    userId?: string;
  }): Promise<IChatTurnResult> {
    const session = await this.findOwnedSession(input.sessionId, input.userId);
    if (!this.ai) throw new Error('AI provider is not configured');

    // Find the last user message
    const messages = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { createdTime: 'desc' },
      take: 20,
    });
    const lastUser = messages.find((m) => m.role === 'user');
    if (!lastUser) {
      throw new NotFoundException(`no user message found in session ${input.sessionId}`);
    }

    // Delete assistant messages created after the user message (the ones
    // we want to regenerate).
    const cutoff = lastUser.createdTime;
    await this.prisma.aiChatMessage.deleteMany({
      where: {
        sessionId: input.sessionId,
        role: 'assistant',
        createdTime: { gte: cutoff },
      },
    });

    // Re-run the LLM call with the same user message. We intentionally
    // bypass chatTurn() so we do not re-persist a duplicate user
    // message; we just need the assistant reply.
    const history = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: input.sessionId, createdTime: { lt: cutoff } },
      orderBy: { createdTime: 'asc' },
      take: MAX_HISTORY_TURNS,
    });
    const autoContext = await this.resolveContextPrefix(session, undefined);
    const skill = await this.resolveSkill({ userMessage: lastUser.content, session });
    const memory = await this.resolveMemory({ userId: session.createdBy, baseId: session.baseId });
    const preferences = await this.resolvePreferences(session.createdBy);
    const nodeRefs = await this.resolveNodeRefs(input.sessionId, session.createdBy);
    const tools = await this.resolveTools({
      session: { baseId: session.baseId, tableId: session.tableId },
      userMessage: skill ? skill.remainder : lastUser.content,
    });
    const smartLevel = await this.resolveSmartLevel({
      userId: session.createdBy,
      override: input.smartLevel,
    });
    const prompt = this.buildPrompt({
      skillSystem: skill?.systemPrompt,
      context: [autoContext, nodeRefs].filter(Boolean).join('\n\n'),
      memory,
      preferences,
      tools,
      smartLevel,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      userMessage: skill ? skill.remainder : lastUser.content,
    });

    const startedAt = Date.now();
    const baseId = session.baseId ?? '';
    const text = await this.ai.generateText(baseId, { prompt, task: 'coding' as never });
    const durationMs = Date.now() - startedAt;
    const assistantContent = text.trim();

    const assistantMessage = await this.addMessage({
      sessionId: input.sessionId,
      role: 'assistant',
      content: assistantContent,
      model: session.model ?? undefined,
      promptTokens: estimateTokens(prompt),
      completionTokens: estimateTokens(assistantContent),
      durationMs,
    });

    return {
      userMessageId: lastUser.id,
      assistantMessageId: assistantMessage.id,
      assistantContent,
      promptTokens: estimateTokens(prompt),
      completionTokens: estimateTokens(assistantContent),
      durationMs,
      skillName: skill?.skillName,
    };
  }

  /**
   * Edit a user message in place and re-run the LLM from that point.
   * Deletes all messages that followed the edited user message
   * (subsequent assistant + user turns) and appends a fresh assistant
   * reply for the new content.
   */
  async editAndResubmit(input: {
    sessionId: string;
    userMessageId: string;
    newContent: string;
    smartLevel?: 'low' | 'medium' | 'high';
    userId?: string;
  }): Promise<IChatTurnResult> {
    if (!this.ai) throw new Error('AI provider is not configured');
    const session = await this.findOwnedSession(input.sessionId, input.userId);

    const trimmed = input.newContent.trim().slice(0, 8000);
    if (!trimmed) throw new Error('newContent cannot be empty');

    const userMessage = await this.prisma.aiChatMessage.findUnique({
      where: { id: input.userMessageId },
    });
    if (!userMessage || userMessage.sessionId !== input.sessionId) {
      throw new NotFoundException(`user message not found: ${input.userMessageId}`);
    }
    if (userMessage.role !== 'user') {
      throw new Error(`only user messages can be edited; got role ${userMessage.role}`);
    }

    // Update the user message content
    await this.prisma.aiChatMessage.update({
      where: { id: input.userMessageId },
      data: { content: trimmed },
    });

    // Delete all messages after this user message
    await this.prisma.aiChatMessage.deleteMany({
      where: {
        sessionId: input.sessionId,
        createdTime: { gt: userMessage.createdTime },
      },
    });

    // Get history (only messages before or equal to this user message)
    const history = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: input.sessionId, createdTime: { lt: userMessage.createdTime } },
      orderBy: { createdTime: 'asc' },
      take: MAX_HISTORY_TURNS,
    });

    const autoContext = await this.resolveContextPrefix(session, undefined);
    const skill = await this.resolveSkill({ userMessage: trimmed, session });
    const memory = await this.resolveMemory({ userId: session.createdBy, baseId: session.baseId });
    const preferences = await this.resolvePreferences(session.createdBy);
    const nodeRefs = await this.resolveNodeRefs(input.sessionId, session.createdBy);
    const tools = await this.resolveTools({
      session: { baseId: session.baseId, tableId: session.tableId },
      userMessage: skill ? skill.remainder : trimmed,
    });
    const smartLevel = await this.resolveSmartLevel({
      userId: session.createdBy,
      override: input.smartLevel,
    });
    const prompt = this.buildPrompt({
      skillSystem: skill?.systemPrompt,
      context: [autoContext, nodeRefs].filter(Boolean).join('\n\n'),
      memory,
      preferences,
      tools,
      smartLevel,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      userMessage: skill ? skill.remainder : trimmed,
    });

    const startedAt = Date.now();
    const baseId = session.baseId ?? '';
    const text = await this.ai.generateText(baseId, { prompt, task: 'coding' as never });
    const durationMs = Date.now() - startedAt;
    const assistantContent = text.trim();

    const assistantMessage = await this.addMessage({
      sessionId: input.sessionId,
      role: 'assistant',
      content: assistantContent,
      model: session.model ?? undefined,
      promptTokens: estimateTokens(prompt),
      completionTokens: estimateTokens(assistantContent),
      durationMs,
    });

    return {
      userMessageId: input.userMessageId,
      assistantMessageId: assistantMessage.id,
      assistantContent,
      promptTokens: estimateTokens(prompt),
      completionTokens: estimateTokens(assistantContent),
      durationMs,
      skillName: skill?.skillName,
    };
  }

  /**
   * Stage 48 — detect data-query intent in the user message and call
   * the appropriate read-only tool (`list_tables` / `list_fields` /
   * `count_records` / `get_records` / `search_records`). The result is a
   * Markdown block injected into the prompt so the model can answer with
   * real data instead of "抱歉我无法访问数据库". Up to 2 tool invocations
   * per turn to keep the prompt compact.
   */
  private async resolveTools(input: {
    session: { baseId: string | null; tableId: string | null };
    userMessage: string;
  }): Promise<string | undefined> {
    if (!this.toolsService || !input.session.baseId) return undefined;
    const text = input.userMessage.trim();
    if (!text) return undefined;
    const baseId = input.session.baseId;
    const sessionTableId = input.session.tableId;
    const lower = text.toLowerCase();

    const asksCount = /(多少|几条|count|how many|how\smuch|几条记录|多少条|记录数)/i.test(text);
    const asksList =
      /(列出|显示|列出所有|前\s*\d+\s*条|前\s*\d+|first\s+\d+|show\s+\d+|list\s+all|all\s+records|all\s+rows)/i.test(
        text
      );
    const asksSearch = /(搜索|查找|找出|包含|匹配|search|find|where|match|like)/i.test(text);
    const asksFields = /(字段|列|field|column|属性|properties)/i.test(text);
    const asksTables = /(表|哪些表|tables|all tables)/i.test(text) && !sessionTableId;

    // Determine table reference (session tableId or first table whose name appears in the text)
    let tableRef: string | null = sessionTableId;
    let tableNameHint: string | null = null;
    const tableNameMatch =
      text.match(/[『「"']([^』」"']+?)[』」"']\s*表/) ||
      text.match(/([A-Za-z一-鿿][\w一-鿿\s]{1,30})\s*表/);
    if (tableNameMatch && !tableRef) {
      tableNameHint = (tableNameMatch[1] ?? '').trim();
    }

    const blocks: string[] = [];
    if (asksTables) {
      const r = await this.toolsService.listTables(baseId);
      blocks.push(r.markdown);
    } else if (sessionTableId || tableNameHint) {
      const target = tableRef ?? tableNameHint!;
      if (asksCount) {
        const r = await this.toolsService.countRecords(baseId, target);
        blocks.push(r.markdown);
      }
      if (asksSearch) {
        // extract quoted or trailing query term
        const qm =
          text.match(/[『「"']([^』」"']+)[』」"']/) ||
          text.match(
            /(?:搜索|查找|找出|包含|匹配|search|find|where|match|like)\s*[:：]?\s*(.+?)(?:\s*(?:在|表|记录)|$)/i
          );
        const query = (qm?.[1] ?? '').trim() || text;
        const r = await this.toolsService.searchRecords(baseId, String(target), query, 10);
        blocks.push(r.markdown);
      }
      if (asksList) {
        const lm = text.match(/前\s*(\d+)\s*条|first\s+(\d+)/i);
        const limit = Number(lm?.[1] ?? lm?.[2] ?? 10);
        const r = await this.toolsService.getRecords(baseId, String(target), limit);
        blocks.push(r.markdown);
      }
      if (asksFields && !asksCount && !asksList && !asksSearch) {
        const r = await this.toolsService.listFields(baseId, String(target));
        blocks.push(r.markdown);
      }
    }

    if (blocks.length === 0) return undefined;
    return `Available data (auto-fetched via read-only tools, current as of ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC):\n\n${blocks.join('\n\n')}`;
  }

  private async resolveNodeRefs(sessionId: string, userId: string): Promise<string> {
    if (!this.nodeRefService) return '';
    try {
      return await this.nodeRefService.renderPrompt(sessionId, userId);
    } catch (error) {
      this.logger.warn(
        `node reference refresh failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      );
      return '';
    }
  }

  private buildPrompt(input: {
    skillSystem?: string;
    context?: string;
    memory?: string;
    preferences?: string;
    tools?: string;
    smartLevel?: string;
    history: ReadonlyArray<{ role: string; content: string }>;
    userMessage: string;
  }): string {
    const parts: string[] = [];
    if (input.skillSystem) {
      parts.push(`Skill instructions:\n${input.skillSystem}`);
    }
    if (input.context) {
      parts.push(`Context:\n${input.context}`);
    }
    if (input.tools) {
      parts.push(input.tools);
    }
    if (input.memory) {
      parts.push(input.memory);
    }
    if (input.preferences) {
      parts.push(input.preferences);
    }
    if (input.smartLevel) {
      parts.push(input.smartLevel);
    }
    for (const turn of input.history) {
      parts.push(`${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`);
    }
    parts.push(`User: ${input.userMessage}`);
    parts.push('Assistant:');
    return parts.join('\n\n');
  }

  // ─── R60 — LLM router (feature-flagged, replaces echo path) ──────

  /**
   * Single chat turn via the R58/R59 LLM wiring. Used when the
   * `AI_CHAT_LLM_ROUTER_ENABLED` flag is on; otherwise the existing
   * `chatTurn` (AiService path) stays in charge.
   */
  async chatTurnLlm(input: IChatTurnInput): Promise<IChatTurnResult> {
    if (!readFeatureFlag() || !this.llmService) {
      throw new Error('AI Chat LLM router is not enabled');
    }
    const session = await this.findOwnedSession(input.sessionId, input.userId);
    const rawHistory = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { createdTime: 'asc' },
      take: MAX_HISTORY_TURNS,
    });
    const history = rawHistory.map(toMessageRow);
    const userMessage = await this.addMessage({
      sessionId: input.sessionId,
      role: 'user',
      content: input.userMessage,
    });
    const { system, messages } = await this.assembleLlmMessages(input, session, history);
    const setting = await this.loadAiSettingSafe();
    const decision = decideLlmRoute(setting, process.env, this.llmService);
    if (decision.mode === 'legacy') {
      throw new Error('AI Chat LLM router disabled by feature flag');
    }
    const startedAt = Date.now();
    const routed = await this.llmService.run(
      {
        system,
        messages: messages as never,
        baseId: session.baseId ?? undefined,
      },
      setting
    );
    const durationMs = Date.now() - startedAt;
    const assistantContent = (routed.text ?? '').trim();
    const assistantMessage = await this.addMessage({
      sessionId: input.sessionId,
      role: 'assistant',
      content: assistantContent,
      model: session.model ?? undefined,
      promptTokens: routed.usage.prompt_tokens,
      completionTokens: routed.usage.completion_tokens,
      durationMs,
    });
    await this.detectArtifactsSafely(assistantContent, session.id, assistantMessage.id);
    if (!session.title) {
      const titleFromMessage = input.userMessage.slice(0, 40).replace(/\\s+/g, ' ').trim();
      if (titleFromMessage) {
        await this.prisma.aiChatSession.update({
          where: { id: input.sessionId },
          data: { title: titleFromMessage },
        });
      }
    }
    void this.drainQueue(input.sessionId);
    return {
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      assistantContent,
      promptTokens: routed.usage.prompt_tokens,
      completionTokens: routed.usage.completion_tokens,
      durationMs,
      skillName: undefined,
    };
  }

  /**
   * Streaming chat turn via the R58/R59 LLM wiring. Mirrors
   * `chatTurnStreaming` but routes through AiChatLlmService.stream
   * so the real OpenAI-compatible provider (or echo fallback) is the
   * source of truth.
   */
  async *chatTurnStreamingLlm(input: IChatTurnInput): AsyncGenerator<
    | { delta: string; done: false }
    | {
        delta: '';
        done: true;
        userMessageId: string;
        assistantMessageId: string;
        assistantContent: string;
        promptTokens: number;
        completionTokens: number;
        durationMs: number;
      }
  > {
    if (!readFeatureFlag() || !this.llmService) {
      throw new Error('AI Chat LLM router is not enabled');
    }
    const session = await this.findOwnedSession(input.sessionId, input.userId);
    const rawHistory = await this.prisma.aiChatMessage.findMany({
      where: { sessionId: input.sessionId },
      orderBy: { createdTime: 'asc' },
      take: MAX_HISTORY_TURNS,
    });
    const history = rawHistory.map(toMessageRow);
    const userMessage = await this.addMessage({
      sessionId: input.sessionId,
      role: 'user',
      content: input.userMessage,
    });
    const { system, messages } = await this.assembleLlmMessages(input, session, history);
    const setting = await this.loadAiSettingSafe();
    const decision = decideLlmRoute(setting, process.env, this.llmService);
    if (decision.mode === 'legacy') {
      throw new Error('AI Chat LLM router disabled by feature flag');
    }
    const startedAt = Date.now();
    let accumulated = '';
    for await (const ev of this.llmService.stream(
      {
        system,
        messages: messages as never,
        baseId: session.baseId ?? undefined,
      },
      setting
    )) {
      if ('delta' in ev && ev.delta) {
        accumulated += ev.delta;
        yield { delta: ev.delta, done: false };
      }
    }
    const durationMs = Date.now() - startedAt;
    const assistantContent = accumulated.trim();
    const assistantMessage = await this.addMessage({
      sessionId: input.sessionId,
      role: 'assistant',
      content: assistantContent,
      model: session.model ?? undefined,
      promptTokens: estimateTokens(system + '\\n' + messages.map((m) => m.content).join('\\n')),
      completionTokens: estimateTokens(assistantContent),
      durationMs,
    });
    await this.detectArtifactsSafely(assistantContent, session.id, assistantMessage.id);
    if (!session.title) {
      const titleFromMessage = input.userMessage.slice(0, 40).replace(/\\s+/g, ' ').trim();
      if (titleFromMessage) {
        await this.prisma.aiChatSession.update({
          where: { id: input.sessionId },
          data: { title: titleFromMessage },
        });
      }
    }
    void this.drainQueue(input.sessionId);
    yield {
      delta: '',
      done: true,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
      assistantContent,
      promptTokens: estimateTokens(system + '\\n' + messages.map((m) => m.content).join('\\n')),
      completionTokens: estimateTokens(assistantContent),
      durationMs,
    };
  }

  /**
   * Assemble `system` prompt + `messages[]` from session context.
   * Mirrors the inline logic in `chatTurn` but stays pure so the
   * LLM router does not need to re-resolve skills/memory/etc.
   */
  private async assembleLlmMessages(
    input: IChatTurnInput,
    session: IAiChatSession,
    history: ReadonlyArray<{ role: AiChatRole; content: string }>
  ): Promise<{
    system: string;
    messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }>;
  }> {
    const autoContext = await this.resolveContextPrefix(session, input.context);
    const attachmentBlock = input.attachmentIds?.length
      ? await this.attachmentExtractor?.resolveToTextBlock(input.attachmentIds)
      : '';
    const skill = await this.resolveSkill({ userMessage: input.userMessage, session });
    const memory = await this.resolveMemory({
      userId: session.createdBy,
      baseId: session.baseId,
    });
    const preferences = await this.resolvePreferences(session.createdBy);
    const nodeRefs = await this.resolveNodeRefs(input.sessionId, session.createdBy);
    const context = [autoContext || input.context, nodeRefs, attachmentBlock]
      .filter(Boolean)
      .join('\\n\\n');
    const parts: string[] = [];
    if (skill?.systemPrompt) parts.push(skill.systemPrompt);
    if (memory) parts.push(`Memory:\\n${memory}`);
    if (preferences) parts.push(`Preferences:\\n${preferences}`);
    if (context) parts.push(`Context:\\n${context}`);
    const system = parts.join('\\n\\n');
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    messages.push({ role: 'user', content: skill ? skill.remainder : input.userMessage });
    return { system, messages: messages as never as Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string }> };
  }

  private async detectArtifactsSafely(
    assistantContent: string,
    sessionId: string,
    messageId: string
  ): Promise<void> {
    if (!this.artifactService) return;
    try {
      const detected = this.artifactService.detectFromMessage(assistantContent);
      for (const d of detected) {
        await this.artifactService.create({
          sessionId,
          messageId,
          format: d.format,
          title: d.title,
          content: d.content,
        });
      }
    } catch (error) {
      this.logger.warn(
        `artifact detection failed (R60) for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async loadAiSettingSafe() {
    try {
      return await getAiSetting(this.prisma);
    } catch {
      return null;
    }
  }
}

function toSessionRow(row: {
  id: string;
  baseId: string | null;
  tableId: string | null;
  viewId: string | null;
  title: string | null;
  model: string | null;
  smartLevel: string | null;
  tokenBudget: number | null;
  allowedTools: unknown;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}): IAiChatSession {
  return {
    id: row.id,
    baseId: row.baseId,
    tableId: row.tableId,
    viewId: row.viewId,
    title: row.title,
    model: row.model,
    smartLevel: row.smartLevel,
    tokenBudget: row.tokenBudget,
    allowedTools: row.allowedTools,
    createdBy: row.createdBy,
    createdTime: row.createdTime,
    updatedTime: row.updatedTime,
  };
}

function toMessageRow(row: {
  id: string;
  sessionId: string;
  role: string;
  content: string;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  createdTime: Date;
}): IAiChatMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    role: row.role as IAiChatMessage['role'],
    content: row.content,
    model: row.model,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    durationMs: row.durationMs,
    createdTime: row.createdTime,
  };
}
