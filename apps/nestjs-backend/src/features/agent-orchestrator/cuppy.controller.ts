import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';
import type { IClsStore } from '../../types/cls';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { PermissionService } from '../auth/permission.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AgentOrchestratorService } from './agent-orchestrator.service';

const CuppyGuard = LicenseCapabilityGuard.for('cuppy_claw');

// ──────────────────────────── Zod Schemas ────────────────────────────
const cuppyChatSchema = z.object({
  baseId: z.string().trim().min(1).max(128).optional(),
  conversationId: z.string().trim().min(1).max(128).optional(),
  message: z.string().trim().min(1).max(10_000),
});

const memorySetSchema = z.object({
  key: z.string().trim().min(1).max(128),
  value: z.string().min(1).max(8_000),
});

const memoryDeleteSchema = z.object({
  key: z.string().trim().min(1).max(128).optional(),
});

const artifactCreateSchema = z.object({
  name: z.string().trim().min(1).max(256),
  kind: z.enum(['chart', 'report', 'page', 'card', 'doc']),
  content: z.string().max(64_000),
});

const artifactVersionSchema = z.object({
  content: z.string().max(64_000),
});

const artifactShareSchema = z.object({
  on: z.boolean(),
});

const smartLevelSchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
});

const nodeRefSchema = z.object({
  kind: z.enum(['table', 'view', 'app', 'automation', 'folder']),
  refId: z.string().trim().min(1).max(128),
  label: z.string().trim().min(1).max(256),
});

const fileAddSchema = z.object({
  name: z.string().trim().min(1).max(256),
  mime: z.string().trim().min(1).max(128),
  size: z.number().int().min(0).max(1024 * 1024 * 1024),
});

const modelPickSchema = z.object({
  model: z.string().trim().min(1).max(128),
});

type CuppyChatBody = z.infer<typeof cuppyChatSchema>;

/**
 * R-AI-1: Cloud AI 对话能力 HTTP 补齐。
 *
 * 完整路由(全部 `/api/cuppy/*`,CuppyGuard license 守门):
 *   POST   /chat                                       原有 — 普通对话
 *   GET    /models                                     列出可用模型
 *   GET    /conversations/:id                          获取对话完整状态
 *   GET    /conversations/:id/messages                 消息历史
 *   DELETE /conversations/:id                          删除对话
 *   GET    /conversations/:id/smart-level              获取智能级别
 *   POST   /conversations/:id/smart-level              设置智能级别
 *   POST   /conversations/:id/model                    切换对话模型
 *   GET    /conversations/:id/memory                   列出记忆
 *   PUT    /conversations/:id/memory                   设置单条记忆
 *   DELETE /conversations/:id/memory                   清空记忆(可选 key)
 *   GET    /conversations/:id/artifacts                列出 Artifact
 *   POST   /conversations/:id/artifacts                新建 Artifact
 *   GET    /conversations/:id/artifacts/:artId         获取 Artifact(含版本)
 *   POST   /conversations/:id/artifacts/:artId/versions 追加 Artifact 版本
 *   DELETE /conversations/:id/artifacts/:artId         删除 Artifact
 *   POST   /conversations/:id/artifacts/:artId/share   开启/关闭分享
 *   GET    /conversations/:id/nodes                    列出 @-node 引用
 *   POST   /conversations/:id/nodes                    添加 @-node 引用
 *   DELETE /conversations/:id/nodes/:nodeId            删除 @-node 引用
 *   GET    /conversations/:id/files                    列出文件附件
 *   POST   /conversations/:id/files                    添加文件附件
 *   DELETE /conversations/:id/files/:fileId            删除文件附件
 *
 * 数据全部存于 ConversationContext.scratchpad(内存),best-minimal 改造。
 */
@Controller('api/cuppy')
@UseGuards(CuppyGuard)
export class CuppyController {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly cls: ClsService<IClsStore>,
    private readonly permissionService: PermissionService
  ) {}

  private requireUserId(): string {
    const userId = this.cls.get('user.id');
    if (!userId) throw new BadRequestException('user context missing');
    return userId;
  }

  // ──────────────────────────── 原 chat 端点 ────────────────────────────
  @Post('chat')
  async chat(
    @Body(new ZodValidationPipe(cuppyChatSchema)) body: CuppyChatBody
  ): Promise<{ conversationId: string; text: string }> {
    const userId = this.requireUserId();
    if (body.baseId) {
      await this.permissionService.validPermissions(
        body.baseId,
        ['base|read'],
        this.cls.get('accessTokenId')
      );
    }
    const conversationId = body.conversationId ?? randomUUID();
    const reply = await this.orchestrator.handle(conversationId, userId, {
      user_id: userId,
      text: body.message,
      provider_meta: { transport: 'http', ...(body.baseId ? { baseId: body.baseId } : {}) },
    });
    return { conversationId, text: reply.text };
  }

  /**
   * R-AI-11: SSE-streamed chat. Mirrors `POST /chat` but pipes the LLM
   * response to the client as `{delta, done, value}` events. Honors a
   * client-side abort by cancelling the upstream LLM call mid-stream.
   */
  @Post('chat/stream')
  async chatStream(
    @Body(new ZodValidationPipe(cuppyChatSchema)) body: CuppyChatBody,
    @Res() res: Response,
    @Req() req: { on(event: 'close', listener: () => void): unknown }
  ): Promise<void> {
    const userId = this.requireUserId();
    if (body.baseId) {
      await this.permissionService.validPermissions(
        body.baseId,
        ['base|read'],
        this.cls.get('accessTokenId')
      );
    }
    const conversationId = body.conversationId ?? randomUUID();
    const abortController = new AbortController();
    req.on('close', () => {
      try {
        abortController.abort();
      } catch {
        // already aborted
      }
    });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (payload: Record<string, unknown>) => {
      try {
        res.write(`data: ${JSON.stringify({ conversationId, ...payload })}\n\n`);
        (res as Response & { flush?: () => void }).flush?.();
      } catch {
        // client gone
      }
    };

    try {
      for await (const chunk of this.orchestrator.chatStream(
        conversationId,
        userId,
        {
          user_id: userId,
          text: body.message,
          provider_meta: { transport: 'sse', ...(body.baseId ? { baseId: body.baseId } : {}) },
        },
        abortController.signal
      )) {
        if (res.writableEnded || res.destroyed) return;
        if (chunk.done) {
          send({ delta: '', value: chunk.value ?? '', done: true });
        } else {
          send({ delta: chunk.delta, done: false });
        }
      }
    } catch (error) {
      send({
        delta: '',
        done: true,
        error: error instanceof Error ? error.message : 'stream failed',
      });
    } finally {
      res.end();
    }
  }

  // ──────────────────────────── 模型列表 ────────────────────────────
  @Get('models')
  listModels(): { models: Array<{ id: string; label: string; tier: string }> } {
    return { models: this.orchestrator.listModels() };
  }

  // ──────────────────────────── 对话状态/历史 ────────────────────────────
  @Get('conversations/:id')
  inspect(@Param('id') id: string): {
    conversationId: string;
    userId: string;
    baseId?: string;
    messageCount: number;
    activeTools: string[];
    smartLevel: string;
    updatedAt: number;
  } | { conversation: null } {
    const ctx = this.orchestrator.inspect(id);
    if (!ctx) return { conversation: null };
    return {
      conversationId: ctx.conversation_id,
      userId: ctx.user_id,
      baseId: ctx.base_id,
      messageCount: ctx.messages.length,
      activeTools: ctx.active_tools,
      smartLevel: this.orchestrator.getSmartLevel(id),
      updatedAt: ctx.updated_at,
    };
  }

  @Get('conversations/:id/messages')
  messages(@Param('id') id: string): {
    conversationId: string;
    messages: Array<{ role: string; content: string; ts: number }>;
  } | { messages: null } {
    const ctx = this.orchestrator.inspect(id);
    if (!ctx) return { messages: null };
    return {
      conversationId: ctx.conversation_id,
      messages: ctx.messages.map((m) => ({ role: m.role, content: m.content, ts: m.ts })),
    };
  }

  @Delete('conversations/:id')
  deleteConversation(@Param('id') id: string): { deleted: boolean } {
    const existed = this.orchestrator.reset(id);
    return { deleted: existed };
  }

  // ──────────────────────────── 智能级别 ────────────────────────────
  @Get('conversations/:id/smart-level')
  getSmartLevel(@Param('id') id: string): { smartLevel: string } {
    return { smartLevel: this.orchestrator.getSmartLevel(id) };
  }

  @Post('conversations/:id/smart-level')
  setSmartLevel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(smartLevelSchema)) body: { level: string }
  ): { level: string } {
    const userId = this.requireUserId();
    return this.orchestrator.setSmartLevel(id, userId, body.level);
  }

  @Post('conversations/:id/model')
  pickModel(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(modelPickSchema)) body: { model: string }
  ): { conversationId: string; model: string } {
    const userId = this.requireUserId();
    // 复用 memory scratchpad 存 'picked_model' 字段,smart-level 走独立字段
    this.orchestrator.setMemory(id, userId, '_picked_model', body.model);
    return { conversationId: id, model: body.model };
  }

  // ──────────────────────────── 记忆(memory) ────────────────────────────
  @Get('conversations/:id/memory')
  getMemory(@Param('id') id: string): {
    conversationId: string;
    memory: Record<string, { value: string; createdAt: string }>;
    count: number;
  } {
    const memory = this.orchestrator.getMemory(id);
    return { conversationId: id, memory, count: Object.keys(memory).length };
  }

  @Put('conversations/:id/memory')
  setMemory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(memorySetSchema)) body: { key: string; value: string }
  ): { key: string; createdAt: string } {
    const userId = this.requireUserId();
    return this.orchestrator.setMemory(id, userId, body.key, body.value);
  }

  @Delete('conversations/:id/memory')
  clearMemory(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(memoryDeleteSchema)) body: { key?: string }
  ): { cleared: number } {
    const userId = this.requireUserId();
    return this.orchestrator.clearMemory(id, userId, body.key);
  }

  // ──────────────────────────── Artifact ────────────────────────────
  @Get('conversations/:id/artifacts')
  listArtifacts(@Param('id') id: string): {
    conversationId: string;
    artifacts: Array<{ id: string; name: string; kind: string; versions: number; createdAt: string; shared: boolean }>;
    count: number;
  } {
    const artifacts = this.orchestrator.listArtifacts(id);
    return { conversationId: id, artifacts, count: artifacts.length };
  }

  @Post('conversations/:id/artifacts')
  createArtifact(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(artifactCreateSchema)) body: { name: string; kind: string; content: string }
  ): { id: string; name: string; kind: string; versions: number; createdAt: string } {
    const userId = this.requireUserId();
    return this.orchestrator.addArtifact(id, userId, body);
  }

  @Get('conversations/:id/artifacts/:artId')
  getArtifact(
    @Param('id') id: string,
    @Param('artId') artId: string
  ): {
    id: string;
    name: string;
    kind: string;
    content: string;
    versions: Array<{ version: number; content: string; createdAt: string }>;
    shared: boolean;
    createdAt: string;
  } {
    const a = this.orchestrator.getArtifact(id, artId);
    if (!a) throw new NotFoundException('artifact not found');
    return {
      id: String(a['id']),
      name: String(a['name']),
      kind: String(a['kind']),
      content: String(a['content']),
      versions: (a['versions'] as Array<{ version: number; content: string; createdAt: string }>) || [],
      shared: Boolean(a['shared']),
      createdAt: String(a['createdAt']),
    };
  }

  @Post('conversations/:id/artifacts/:artId/versions')
  appendArtifactVersion(
    @Param('id') id: string,
    @Param('artId') artId: string,
    @Body(new ZodValidationPipe(artifactVersionSchema)) body: { content: string }
  ): { id: string; versions: number } {
    const userId = this.requireUserId();
    const result = this.orchestrator.appendArtifactVersion(id, userId, artId, body.content);
    if (!result) throw new NotFoundException('artifact not found');
    return result;
  }

  @Delete('conversations/:id/artifacts/:artId')
  deleteArtifact(
    @Param('id') id: string,
    @Param('artId') artId: string
  ): { deleted: boolean } {
    const userId = this.requireUserId();
    const ok = this.orchestrator.deleteArtifact(id, userId, artId);
    return { deleted: ok };
  }

  @Post('conversations/:id/artifacts/:artId/share')
  shareArtifact(
    @Param('id') id: string,
    @Param('artId') artId: string,
    @Body(new ZodValidationPipe(artifactShareSchema)) body: { on: boolean }
  ): { id: string; shared: boolean } {
    const userId = this.requireUserId();
    const r = this.orchestrator.shareArtifact(id, userId, artId, body.on);
    if (!r) throw new NotFoundException('artifact not found');
    return r;
  }

  // ──────────────────────────── @-node 引用 ────────────────────────────
  @Get('conversations/:id/nodes')
  listNodes(@Param('id') id: string): {
    conversationId: string;
    nodes: Array<{ nodeId: string; kind: string; refId: string; label: string; addedAt: string }>;
    count: number;
  } {
    const nodes = this.orchestrator.listNodeRefs(id);
    return { conversationId: id, nodes, count: nodes.length };
  }

  @Post('conversations/:id/nodes')
  addNode(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(nodeRefSchema)) body: { kind: string; refId: string; label: string }
  ): { nodeId: string; kind: string; refId: string; label: string; addedAt: string } {
    const userId = this.requireUserId();
    return this.orchestrator.addNodeRef(id, userId, body);
  }

  @Delete('conversations/:id/nodes/:nodeId')
  removeNode(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string
  ): { deleted: boolean } {
    const userId = this.requireUserId();
    const ok = this.orchestrator.removeNodeRef(id, userId, nodeId);
    return { deleted: ok };
  }

  // ──────────────────────────── 文件附件 ────────────────────────────
  @Get('conversations/:id/files')
  listFiles(@Param('id') id: string): {
    conversationId: string;
    files: Array<{ fileId: string; name: string; mime: string; size: number; createdAt: string }>;
    count: number;
  } {
    const files = this.orchestrator.listFiles(id);
    return { conversationId: id, files, count: files.length };
  }

  @Post('conversations/:id/files')
  addFile(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(fileAddSchema)) body: { name: string; mime: string; size: number }
  ): { fileId: string; name: string; mime: string; size: number; createdAt: string } {
    const userId = this.requireUserId();
    return this.orchestrator.addFile(id, userId, body);
  }

  @Delete('conversations/:id/files/:fileId')
  removeFile(
    @Param('id') id: string,
    @Param('fileId') fileId: string
  ): { deleted: boolean } {
    const userId = this.requireUserId();
    const ok = this.orchestrator.removeFile(id, userId, fileId);
    return { deleted: ok };
  }
}
