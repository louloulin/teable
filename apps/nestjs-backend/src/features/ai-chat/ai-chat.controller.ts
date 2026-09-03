/**
 * AI Chat HTTP controller (Stage 35 — Cloud §ai/ai-chat).
 *
 * Endpoints (all under /api/chat):
 *   POST   /sessions                       create session
 *   GET    /sessions?baseId=&createdBy=   list sessions
 *   GET    /sessions/:sessionId            get session
 *   DELETE /sessions/:sessionId            delete session + messages
 *   GET    /sessions/:sessionId/messages   list messages
 *   POST   /sessions/:sessionId/turn       send user message, get assistant reply
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';
import { AiChatAuthService } from './ai-chat.auth.service';
import { AiChatSkillService } from './ai-chat-skill.service';
import { AiChatSearchService } from './ai-chat-search.service';
import { AiChatExportService } from './ai-chat-export.service';
import { AiChatPreferenceService } from './ai-chat-preference.service';
import { AiChatUsageService } from './ai-chat-usage.service';
import { AiChatToolsService } from './ai-chat-tools.service';
import { AiChatLongTaskService } from './ai-chat-long-task.service';
import { AiChatArtifactService } from './ai-chat-artifact.service';
import { AiChatSmartLevelService } from './ai-chat-smart-level.service';
import { AiChatQueueService } from './ai-chat-queue.service';
import { AiChatWritePlanService } from './ai-chat-write-plan.service';
import { AiChatNodeRefService } from './ai-chat-node-ref.service';
import { DEFAULT_AI_SETTING } from '../ai-setting/ai-setting.types';

@Controller('api/chat')
export class AiChatController {
  constructor(
    private readonly svc: AiChatAuthService,
    private readonly cls: ClsService<IClsStore>,
    private readonly skills: AiChatSkillService,
    private readonly search: AiChatSearchService,
    private readonly exporter: AiChatExportService,
    private readonly prefs: AiChatPreferenceService,
    private readonly usage: AiChatUsageService,
    private readonly tools: AiChatToolsService,
    private readonly longTasks: AiChatLongTaskService,
    private readonly artifacts: AiChatArtifactService,
    private readonly smartLevelService: AiChatSmartLevelService,
    private readonly queue: AiChatQueueService,
    private readonly writePlans: AiChatWritePlanService,
    private readonly nodeRefs: AiChatNodeRefService
  ) {}

  private currentUserId(): string {
    const userId = this.cls.get('user.id');
    if (!userId) throw new UnauthorizedException('AI Chat requires an authenticated user');
    return userId;
  }

  @Post('sessions')
  async createSession(
    @Body()
    body: {
      baseId?: string;
      tableId?: string;
      viewId?: string;
      title?: string;
      model?: string;
    }
  ) {
    return this.svc.createSession({
      baseId: body.baseId,
      tableId: body.tableId,
      viewId: body.viewId,
      title: body.title,
      model: body.model || DEFAULT_AI_SETTING.defaultModel,
      createdBy: this.currentUserId(),
    });
  }

  @Get('sessions')
  async listSessions(@Query('baseId') baseId?: string, @Query('take') take?: string) {
    return this.svc.listSessions({
      baseId,
      createdBy: this.currentUserId(),
      take: take ? Number(take) : 50,
    });
  }

  @Post('sessions/:sessionId/write-plans')
  async createWritePlan(
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      tableId: string;
      operation: 'record_create' | 'record_update';
      summary: string;
      records: Array<{ id?: string; fields: Record<string, unknown> }>;
      fieldKeyType?: string;
      typecast?: boolean;
      expiresInSeconds?: number;
    }
  ) {
    return this.writePlans.create({ ...body, sessionId, userId: this.currentUserId() });
  }

  @Get('sessions/:sessionId/nodes')
  async listNodeRefs(@Param('sessionId') sessionId: string) {
    return this.nodeRefs.list(sessionId, this.currentUserId());
  }

  @Post('sessions/:sessionId/nodes')
  async addNodeRef(
    @Param('sessionId') sessionId: string,
    @Body() body: { kind: string; refId: string }
  ) {
    return this.nodeRefs.add({
      sessionId,
      userId: this.currentUserId(),
      kind: body.kind,
      refId: body.refId,
    });
  }

  @Delete('sessions/:sessionId/nodes/:nodeId')
  async removeNodeRef(@Param('sessionId') sessionId: string, @Param('nodeId') nodeId: string) {
    return this.nodeRefs.remove(sessionId, this.currentUserId(), nodeId);
  }

  @Get('sessions/:sessionId/write-plans')
  async listWritePlans(@Param('sessionId') sessionId: string) {
    return this.writePlans.list(sessionId, this.currentUserId());
  }

  @Post('write-plans/:planId/confirm')
  async confirmWritePlan(@Param('planId') planId: string) {
    return this.writePlans.confirm(planId, this.currentUserId());
  }

  @Get('skills')
  async listSkills() {
    return this.skills.listSkills();
  }

  /**
   * Stage 48 — list available AI Chat tools (read-only data accessors).
   * Returns descriptors so callers can decide which one to invoke.
   */
  @Get('tools')
  async listTools() {
    return this.tools.listTools();
  }

  /**
   * Stage 48 — manually invoke a specific AI Chat tool, e.g. for
   * debugging or for "show me the data" previews. Body:
   *   { "tool": "count_records", "args": { "baseId": "...", "tableId": "..." } }
   */
  @Post('tools/invoke')
  async invokeTool(@Body() body: { tool: string; args: Record<string, unknown> }) {
    const baseId = typeof body.args?.baseId === 'string' ? body.args.baseId : undefined;
    await this.svc.assertBaseReadable(baseId);
    return this.tools.invoke(body.tool, body.args ?? {});
  }

  /**
   * Stage 49 — enqueue a long-running AI task on a session. Body:
   *   { "userMessage": "...", "context"?: "..." }
   * Returns the created task row (status=pending). The in-process worker
   * progresses it to running → completed | failed.
   */
  @Post('sessions/:sessionId/long-task')
  async enqueueLongTask(
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      userMessage: string;
      context?: string;
      idempotencyKey?: string;
      tenantId?: string;
      correlationId?: string;
      maxAttempts?: number;
    }
  ) {
    await this.svc.assertAccessible(sessionId, this.currentUserId());
    return this.longTasks.enqueue({
      sessionId,
      userMessage: body.userMessage,
      context: body.context,
      idempotencyKey: body.idempotencyKey,
      tenantId: body.tenantId,
      correlationId: body.correlationId,
      maxAttempts: body.maxAttempts,
    });
  }

  /** Poll the current state of a long task. */
  @Get('tasks/:taskId')
  async getLongTask(@Param('taskId') taskId: string) {
    const task = await this.longTasks.getTask(taskId);
    await this.svc.assertAccessible(task.sessionId, this.currentUserId());
    return task;
  }

  /** List recent long tasks for a session, most recent first. */
  @Get('sessions/:sessionId/long-tasks')
  async listLongTasks(@Param('sessionId') sessionId: string) {
    await this.svc.assertAccessible(sessionId, this.currentUserId());
    return this.longTasks.listTasks(sessionId);
  }

  @Post('tasks/:taskId/cancel')
  async cancelLongTask(@Param('taskId') taskId: string) {
    const task = await this.longTasks.getTask(taskId);
    await this.svc.assertAccessible(task.sessionId, this.currentUserId());
    return this.longTasks.cancelTask(taskId);
  }

  // ── Stage 50 — Artifact CRUD (Cloud §ai/ai-chat Artifact viewer) ──

  /**
   * Create an artifact manually, e.g. when persisting a generated chart.
   * Body: { sessionId, messageId?, format?, title, content }
   */
  @Post('artifacts')
  async createArtifact(
    @Body()
    body: {
      sessionId: string;
      messageId?: string;
      format?: string;
      title: string;
      content: string;
    }
  ) {
    await this.svc.assertAccessible(body.sessionId, this.currentUserId());
    return this.artifacts.create({
      sessionId: body.sessionId,
      messageId: body.messageId,
      format: (body.format as 'markdown' | 'html' | 'chart' | 'table' | 'mermaid') ?? 'markdown',
      title: body.title,
      content: body.content,
    });
  }

  /** Fetch a single artifact by id. */
  @Get('artifacts/:artifactId')
  async getArtifact(@Param('artifactId') artifactId: string) {
    const artifact = await this.artifacts.getById(artifactId);
    await this.svc.assertAccessible(artifact.sessionId, this.currentUserId());
    return artifact;
  }

  /** List artifacts for a session, most recent first. */
  @Get('sessions/:sessionId/artifacts')
  async listArtifacts(@Param('sessionId') sessionId: string) {
    await this.svc.assertAccessible(sessionId, this.currentUserId());
    return this.artifacts.listBySession(sessionId);
  }

  /** Update an artifact (creates a new version, preserves history). */
  @Put('artifacts/:artifactId')
  async updateArtifact(
    @Param('artifactId') artifactId: string,
    @Body() body: { title?: string; content?: string; format?: string }
  ) {
    const artifact = await this.artifacts.getById(artifactId);
    await this.svc.assertAccessible(artifact.sessionId, this.currentUserId());
    return this.artifacts.update(artifactId, {
      title: body.title,
      content: body.content,
      format: body.format as 'markdown' | 'html' | 'chart' | 'table' | 'mermaid' | undefined,
    });
  }

  /** Delete an artifact. */
  @Delete('artifacts/:artifactId')
  async deleteArtifact(@Param('artifactId') artifactId: string) {
    const artifact = await this.artifacts.getById(artifactId);
    await this.svc.assertAccessible(artifact.sessionId, this.currentUserId());
    return this.artifacts.delete(artifactId);
  }

  // ── Stage 60 — Message Queue (Cloud §ai/ai-chat 消息队列) ──

  /**
   * Enqueue a user message while AI is busy. Body: { userMessage }
   * Position auto-increments. Returned row has status='pending'.
   */
  @Post('sessions/:sessionId/queue')
  async enqueueQueue(@Param('sessionId') sessionId: string, @Body() body: { userMessage: string }) {
    await this.svc.assertAccessible(sessionId, this.currentUserId());
    return this.queue.enqueue({ sessionId, userMessage: body.userMessage });
  }

  /** List queued messages for a session, ordered by position. */
  @Get('sessions/:sessionId/queue')
  async listQueue(@Param('sessionId') sessionId: string) {
    await this.svc.assertAccessible(sessionId, this.currentUserId());
    return this.queue.list(sessionId);
  }

  /** Cancel a pending queued message. */
  @Delete('queue/:queueId')
  async cancelQueue(@Param('queueId') queueId: string) {
    const queued = await this.queue.get(queueId);
    await this.svc.assertAccessible(queued.sessionId, this.currentUserId());
    return this.queue.cancel(queueId);
  }

  /**
   * Reorder pending messages. Body: { order: ['queueId1', 'queueId2', ...] }
   * The IDs must all belong to this session's pending queue.
   */
  @Put('sessions/:sessionId/queue/reorder')
  async reorderQueue(@Param('sessionId') sessionId: string, @Body() body: { order: string[] }) {
    await this.svc.assertAccessible(sessionId, this.currentUserId());
    return this.queue.reorder(sessionId, body.order ?? []);
  }

  /**
   * Get the caller's chat preferences (output language, response length,
   * tone, disclaimer). Returns an empty object when nothing set yet.
   */
  @Get('preferences')
  async getPreferences() {
    return this.prefs.get(this.currentUserId());
  }

  /**
   * Update the caller's chat preferences. Body accepts any subset of
   * `{ outputLanguage, responseLength, tone, disclaimer }`. Invalid
   * values are silently dropped.
   */
  @Put('preferences')
  async updatePreferences(
    @Body()
    body: {
      outputLanguage?: string;
      responseLength?: 'concise' | 'normal' | 'detailed';
      tone?: 'neutral' | 'friendly' | 'formal';
      disclaimer?: boolean;
    }
  ) {
    return this.prefs.update(this.currentUserId(), body);
  }

  /**
   * Full-text search across the caller's chat sessions. Returns ranked
   * results with snippets and a relevance score. Pure additive endpoint.
   */
  @Get('search')
  async searchSessions(
    @Query('q') q: string,
    @Query('baseId') baseId?: string,
    @Query('take') take?: string
  ) {
    return this.search.search({
      userId: this.currentUserId(),
      query: q,
      baseId,
      take: take ? Number(take) : 20,
    });
  }

  @Get('usage/summary')
  async usageSummary() {
    return this.usage.summary(this.currentUserId());
  }

  @Get('usage/daily')
  async usageDaily(@Query('days') days?: string) {
    return this.usage.daily({
      userId: this.currentUserId(),
      days: days ? Number(days) : 7,
    });
  }

  @Get('sessions/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const userId = this.currentUserId();
    const session = await this.svc.getSession(sessionId, userId);
    if (!session) return { error: 'not_found' };
    const messages = await this.svc.listMessages(sessionId, 100, userId);
    return { session, messages };
  }

  @Delete('sessions/:sessionId')
  async deleteSession(@Param('sessionId') sessionId: string) {
    return this.svc.deleteSession(sessionId, this.currentUserId());
  }

  /**
   * Rename an existing session. Body: `{ "title": "..." }`. Returns 404
   * when the session does not exist or empty title.
   */
  @Patch('sessions/:sessionId')
  async renameSession(@Param('sessionId') sessionId: string, @Body() body: { title?: string }) {
    if (!body?.title) return { error: 'title_required' };
    const updated = await this.svc.renameSession({
      sessionId,
      title: body.title,
      userId: this.currentUserId(),
    });
    if (!updated) return { error: 'not_found' };
    return updated;
  }

  /**
   * Fork a session: copy messages up to (and including) `upToMessageIndex`
   * into a new session prefixed with "[Fork]". Body:
   * `{ "upToMessageIndex": 4 }` (optional, defaults to last message).
   */
  @Post('sessions/:sessionId/fork')
  async forkSession(
    @Param('sessionId') sessionId: string,
    @Body() body: { upToMessageIndex?: number }
  ) {
    return this.svc.forkSession({
      sourceSessionId: sessionId,
      upToMessageIndex: body?.upToMessageIndex,
      createdBy: this.currentUserId(),
    });
  }

  /**
   * Regenerate the assistant turn for the latest user message. Deletes
   * the existing assistant message(s) and re-runs the LLM call.
   * Pure additive, no schema changes.
   */
  @Post('sessions/:sessionId/regenerate')
  async regenerateTurn(@Param('sessionId') sessionId: string) {
    return this.svc.regenerateTurn({ sessionId, userId: this.currentUserId() });
  }

  /**
   * Stage 47 — Edit-then-resubmit a specific user message.
   * Updates `userMessageId` content to `newContent`, deletes every
   * later message in the session, and runs a fresh assistant reply
   * against the new prompt. Mirrors the Cloud UX of clicking a user
   * bubble, editing it, and getting a new assistant turn in place.
   *
   * Body: `{ "newContent": "..." }`
   * Returns the same shape as `regenerateTurn`: userMessageId,
   * assistantMessageId, assistantContent, promptTokens,
   * completionTokens, durationMs, skillName.
   */
  @Post('sessions/:sessionId/messages/:messageId/resubmit')
  async editAndResubmit(
    @Param('sessionId') sessionId: string,
    @Param('messageId') messageId: string,
    @Body() body: { newContent: string }
  ) {
    return this.svc.editAndResubmit({
      sessionId,
      userMessageId: messageId,
      newContent: body.newContent,
      userId: this.currentUserId(),
    });
  }

  /**
   * Export a session as Markdown (default) or JSON. Pure additive
   * endpoint; no schema changes required.
   */
  @Get('sessions/:sessionId/export')
  async exportSession(
    @Param('sessionId') sessionId: string,
    @Query('format') format?: string,
    @Query('timestamps') timestamps?: string,
    @Res({ passthrough: true }) res?: Response
  ): Promise<string> {
    const fmt: 'md' | 'json' = format === 'json' ? 'json' : 'md';
    const opts = { includeTimestamps: timestamps === '1' || timestamps === 'true' };
    await this.svc.assertAccessible(sessionId, this.currentUserId());
    const body = await this.exporter.export(sessionId, fmt, opts);
    res?.setHeader(
      'Content-Type',
      fmt === 'json' ? 'application/json' : 'text/markdown; charset=utf-8'
    );
    res?.setHeader(
      'Content-Disposition',
      `attachment; filename="chat-${sessionId}.${fmt === 'json' ? 'json' : 'md'}"`
    );
    return body;
  }

  @Get('sessions/:sessionId/messages')
  async listMessages(@Param('sessionId') sessionId: string) {
    return this.svc.listMessages(sessionId, 100, this.currentUserId());
  }

  @Post('sessions/:sessionId/turn')
  async chatTurn(
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      userMessage: string;
      context?: string;
      smartLevel?: 'low' | 'medium' | 'high';
      attachmentIds?: string[];
    }
  ) {
    return this.svc.chatTurn({
      sessionId,
      userMessage: body.userMessage,
      context: body.context,
      smartLevel: body.smartLevel,
      attachmentIds: body.attachmentIds,
      userId: this.currentUserId(),
    });
  }

  /**
   * Streaming chat turn using Server-Sent Events (SSE). Each `delta`
   * event carries one chunk of the assistant reply; a final `done` event
   * carries the user/assistant message ids + token counts.
   *
   * Event format:
   *   data: {"delta":"Hello","done":false}\n\n
   *   data: {"delta":",","done":false}\n\n
   *   ...
   *   data: {"delta":"","done":true,"userMessageId":"...","assistantMessageId":"...",...}\n\n
   */
  @Post('sessions/:sessionId/turn/stream')
  async chatTurnStream(
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      userMessage: string;
      context?: string;
      smartLevel?: 'low' | 'medium' | 'high';
      attachmentIds?: string[];
    },
    @Res() res: Response
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      for await (const chunk of this.svc.chatTurnStreaming({
        sessionId,
        userMessage: body.userMessage,
        context: body.context,
        userId: this.currentUserId(),
        attachmentIds: body.attachmentIds,
      })) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({ delta: '', done: true, error: (error as Error)?.message ?? String(error) })}\n\n`
      );
    } finally {
      res.end();
    }
  }
}
