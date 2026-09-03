/**
 * AI Chat long task service (Stage 49 — Cloud §ai/ai-chat 24h background execution).
 *
 * Implements "long-running AI task" pattern: a chat turn that the user opts
 * to run asynchronously is persisted as a task row with status
 * `queued` → `running` → `succeeded | failed | canceled`. Clients poll
 * `GET /api/chat/tasks/:taskId` for progress.
 *
 * Execution model:
 *   - `enqueue()` creates the task row + user message + durable queue job.
 *   - A BullMQ (or local fallback) worker calls `processTask(taskId)` which:
 *       1. Updates status → running, startedAt = now
 *       2. Calls the same LLM path used by `chatTurn()`
 *       3. Persists the assistant message
 *       4. Updates status → completed | failed, writes `result`
 *   - Errors during processing are caught, recorded in `error_message`,
 *     and the task transitions to `failed` (after retry exhaustion) or
 *     back to `queued` (with `retryAt`) for transient failures.
 *   - A lease and heartbeat make duplicate workers and restarts safe.
 *   - A unique (sessionId, idempotencyKey) constraint lets callers retry
 *     without creating duplicate tasks.
 */

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import type { Queue } from 'bullmq';
import { estimateTokens } from './ai-chat.helper';
import { AiService } from '../ai/ai.service';

export const AI_CHAT_LONG_TASK_QUEUE = 'ai-chat-long-task-queue';
export const AI_CHAT_LONG_TASK_JOB = 'process';

export type AiTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';

const LEGACY_STATUS_MAP: Record<string, AiTaskStatus> = {
  pending: 'queued',
  completed: 'succeeded',
};
const LEASE_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 30 * 1000;
const MAX_ERROR_LENGTH = 2000;

export interface IAiChatLongTask {
  id: string;
  sessionId: string;
  userMessageId: string;
  status: AiTaskStatus;
  progress: number;
  result: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  idempotencyKey: string | null;
  attempt: number;
  maxAttempts: number;
  heartbeatAt: Date | null;
  leaseUntil: Date | null;
  retryAt: Date | null;
  cancelRequested: boolean;
  tenantId: string | null;
  correlationId: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdTime: Date;
  updatedTime: Date;
}

export interface IEnqueueLongTaskInput {
  sessionId: string;
  userMessage: string;
  context?: string;
  idempotencyKey?: string;
  tenantId?: string;
  correlationId?: string;
  maxAttempts?: number;
}

const LONG_TASK_ID_PREFIX = 'aitk';

@Injectable()
export class AiChatLongTaskService {
  private readonly logger = new Logger(AiChatLongTaskService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ai?: AiService,
    @Optional()
    @InjectQueue(AI_CHAT_LONG_TASK_QUEUE)
    private readonly queue?: Queue<ILongTaskJob>
  ) {}

  /**
   * Enqueue a long-running task for the given session. Persists the user
   * message immediately so the chat history is intact, then schedules a
   * durable worker job. Repeated requests with the same idempotency key
   * return the existing task.
   */
  async enqueue(input: IEnqueueLongTaskInput): Promise<IAiChatLongTask> {
    const trimmed = input.userMessage.trim().slice(0, 8000);
    if (!trimmed) throw new Error('userMessage cannot be empty');

    const session = await this.prisma.aiChatSession.findUnique({
      where: { id: input.sessionId },
    });
    if (!session) throw new NotFoundException(`chat session not found: ${input.sessionId}`);
    if (!this.ai) throw new Error('AI provider is not configured');

    const idempotencyKey = input.idempotencyKey?.trim().slice(0, 200) || undefined;
    if (idempotencyKey) {
      const existing = await this.prisma.aiChatLongTask.findFirst({
        where: { sessionId: input.sessionId, idempotencyKey },
      });
      if (existing) return toTask(existing);
    }

    // Persist the user message first so the chat history is complete
    const userMessage = await this.prisma.aiChatMessage.create({
      data: {
        id: `aicm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
        sessionId: input.sessionId,
        role: 'user',
        content: trimmed,
      },
    });

    const taskId = `${LONG_TASK_ID_PREFIX}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const task = await this.prisma.aiChatLongTask.create({
      data: {
        id: taskId,
        sessionId: input.sessionId,
        userMessageId: userMessage.id,
        status: 'queued',
        context: input.context?.slice(0, 16000),
        idempotencyKey,
        tenantId: input.tenantId,
        correlationId: input.correlationId,
        maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 3, 10)),
      },
    });

    await this.queue?.add(
      AI_CHAT_LONG_TASK_JOB,
      { taskId },
      { jobId: taskId, removeOnComplete: 2000, removeOnFail: 5000 }
    );

    return toTask(task);
  }

  /**
   * Worker entry point. A conditional update acquires the lease, so a
   * duplicate delivery or a restarted worker cannot execute the same task.
   */
  async processTask(taskId: string): Promise<IAiChatLongTask> {
    const existing = await this.prisma.aiChatLongTask.findUnique({
      where: { id: taskId },
      include: { session: true, userMessage: true },
    });
    if (!existing) throw new NotFoundException(`long task not found: ${taskId}`);

    const now = new Date();
    if (existing.cancelRequested || existing.status === 'canceled') {
      const canceled = await this.prisma.aiChatLongTask.update({
        where: { id: taskId },
        data: { status: 'canceled', completedAt: existing.completedAt ?? now },
      });
      return toTask(canceled);
    }
    if (['succeeded', 'completed', 'failed'].includes(existing.status)) return toTask(existing);

    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    const claimed = await this.prisma.aiChatLongTask.updateMany({
      where: {
        id: taskId,
        OR: [
          { status: { in: ['queued', 'pending'] } },
          { status: 'running', leaseUntil: { lt: now } },
        ],
        cancelRequested: false,
      },
      data: {
        status: 'running',
        startedAt: existing.startedAt ?? now,
        heartbeatAt: now,
        leaseUntil,
        attempt: { increment: 1 },
        progress: Math.max(existing.progress, 10),
      },
    });
    if (claimed.count === 0) {
      const current = await this.prisma.aiChatLongTask.findUnique({ where: { id: taskId } });
      if (!current) throw new NotFoundException(`long task not found: ${taskId}`);
      return toTask(current);
    }

    const task = await this.prisma.aiChatLongTask.findUnique({
      where: { id: taskId },
      include: { session: true, userMessage: true },
    });
    if (!task) throw new NotFoundException(`long task not found: ${taskId}`);

    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

    try {
      if (!this.ai) throw new Error('AI provider is not configured');
      const session = task.session;
      const baseId = session.baseId ?? '';

      heartbeatTimer = setInterval(() => {
        this.heartbeat(taskId).catch((error) =>
          this.logger.warn(`long task ${taskId} heartbeat failed: ${String(error)}`)
        );
      }, HEARTBEAT_MS);
      await this.updateProgress(taskId, 35);
      const beforeRun = await this.prisma.aiChatLongTask.findUnique({ where: { id: taskId } });
      if (beforeRun?.cancelRequested) return this.cancelClaimedTask(taskId);

      const text = await this.ai.generateText(baseId, {
        prompt: `You are processing a long-running AI task.\n\nUser: ${task.userMessage.content}${task.context ? `\n\nContext: ${task.context}` : ''}`,
        task: 'coding' as never,
      });
      const result = text.trim();

      const afterRun = await this.prisma.aiChatLongTask.findUnique({ where: { id: taskId } });
      if (afterRun?.cancelRequested) return this.cancelClaimedTask(taskId);

      // Persist assistant message + mark task completed
      await this.prisma.aiChatMessage.create({
        data: {
          id: `aicm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
          sessionId: task.sessionId,
          role: 'assistant',
          content: result,
          model: session.model,
          promptTokens: estimateTokens(task.userMessage.content),
          completionTokens: estimateTokens(result),
          durationMs: 0,
        },
      });

      const updated = await this.prisma.aiChatLongTask.update({
        where: { id: taskId },
        data: {
          status: 'succeeded',
          progress: 100,
          result,
          completedAt: new Date(),
          heartbeatAt: new Date(),
          leaseUntil: null,
        },
      });
      await this.prisma.aiChatSession.update({
        where: { id: task.sessionId },
        data: { updatedTime: new Date() },
      });

      this.logger.log(`long task ${taskId} completed in session ${task.sessionId}`);
      return toTask(updated);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const latest = await this.prisma.aiChatLongTask.findUnique({ where: { id: taskId } });
      const canceled = latest?.cancelRequested;
      const retryable = !canceled && (latest?.attempt ?? 1) < (latest?.maxAttempts ?? 3);
      const retryAt = retryable ? new Date(Date.now() + retryDelay(latest?.attempt ?? 1)) : null;
      const updated = await this.prisma.aiChatLongTask.update({
        where: { id: taskId },
        data: {
          status: canceled ? 'canceled' : retryable ? 'queued' : 'failed',
          errorCode: canceled ? 'TASK_CANCELED' : 'AI_PROVIDER_ERROR',
          errorMessage: message.slice(0, MAX_ERROR_LENGTH),
          completedAt: canceled || !retryable ? new Date() : null,
          retryAt,
          heartbeatAt: new Date(),
          leaseUntil: null,
        },
      });
      if (retryable) {
        await this.queue?.add(
          AI_CHAT_LONG_TASK_JOB,
          { taskId },
          { jobId: `${taskId}:retry:${latest?.attempt ?? 1}`, delay: retryDelay(latest?.attempt ?? 1) }
        );
      }
      this.logger.warn(`long task ${taskId} ${canceled ? 'canceled' : retryable ? 'scheduled for retry' : 'failed'}: ${message}`);
      return toTask(updated);
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    }
  }

  async cancelTask(taskId: string): Promise<IAiChatLongTask> {
    const updated = await this.prisma.aiChatLongTask.updateMany({
      where: { id: taskId, status: { in: ['queued', 'pending', 'running'] } },
      data: { cancelRequested: true, status: 'canceled', completedAt: new Date(), leaseUntil: null },
    });
    if (updated.count === 0) {
      const current = await this.prisma.aiChatLongTask.findUnique({ where: { id: taskId } });
      if (!current) throw new NotFoundException(`long task not found: ${taskId}`);
      return toTask(current);
    }
    const task = await this.prisma.aiChatLongTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`long task not found: ${taskId}`);
    return toTask(task);
  }

  /** Requeue tasks left running by a worker process that was terminated. */
  async recoverExpiredTasks(): Promise<number> {
    const now = new Date();
    const recovered = await this.prisma.aiChatLongTask.updateMany({
      where: {
        status: 'running',
        leaseUntil: { lt: now },
        cancelRequested: false,
      },
      data: { status: 'queued', retryAt: now, leaseUntil: null },
    });
    if (recovered.count && this.queue) {
      const rows = await this.prisma.aiChatLongTask.findMany({
        where: { status: 'queued', retryAt: now },
        select: { id: true },
      });
      await this.queue.addBulk(
        rows.map((row) => ({
          name: AI_CHAT_LONG_TASK_JOB,
          data: { taskId: row.id },
          opts: { jobId: `${row.id}:recovery` },
        }))
      );
    }
    return recovered.count;
  }

  /** Fetch the current task state. */
  async getTask(taskId: string): Promise<IAiChatLongTask> {
    const task = await this.prisma.aiChatLongTask.findUnique({ where: { id: taskId } });
    if (!task) throw new NotFoundException(`long task not found: ${taskId}`);
    return toTask(task);
  }

  /** List all tasks for a session, most recent first. */
  async listTasks(sessionId: string): Promise<IAiChatLongTask[]> {
    const rows = await this.prisma.aiChatLongTask.findMany({
      where: { sessionId },
      orderBy: { createdTime: 'desc' },
      take: 50,
    });
    return rows.map(toTask);
  }

  private async updateProgress(taskId: string, progress: number): Promise<void> {
    await this.prisma.aiChatLongTask.update({
      where: { id: taskId },
      data: { progress, heartbeatAt: new Date(), leaseUntil: new Date(Date.now() + LEASE_MS) },
    });
  }

  private async heartbeat(taskId: string): Promise<void> {
    await this.prisma.aiChatLongTask.updateMany({
      where: { id: taskId, status: 'running', cancelRequested: false },
      data: { heartbeatAt: new Date(), leaseUntil: new Date(Date.now() + LEASE_MS) },
    });
  }

  private async cancelClaimedTask(taskId: string): Promise<IAiChatLongTask> {
    const canceled = await this.prisma.aiChatLongTask.update({
      where: { id: taskId },
      data: { status: 'canceled', errorCode: 'TASK_CANCELED', completedAt: new Date(), leaseUntil: null },
    });
    return toTask(canceled);
  }
}

export interface ILongTaskJob {
  taskId: string;
}

export function retryDelay(attempt: number): number {
  return Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
}

function toTask(row: {
  id: string;
  sessionId: string;
  userMessageId: string;
  status: string;
  progress: number;
  result: string | null;
  errorMessage: string | null;
  errorCode?: string | null;
  idempotencyKey?: string | null;
  attempt?: number;
  maxAttempts?: number;
  heartbeatAt?: Date | null;
  leaseUntil?: Date | null;
  retryAt?: Date | null;
  cancelRequested?: boolean;
  tenantId?: string | null;
  correlationId?: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdTime: Date;
  updatedTime: Date;
}): IAiChatLongTask {
  return {
    id: row.id,
    sessionId: row.sessionId,
    userMessageId: row.userMessageId,
    status: LEGACY_STATUS_MAP[row.status] ?? (row.status as AiTaskStatus),
    progress: row.progress,
    result: row.result,
    errorMessage: row.errorMessage,
    errorCode: row.errorCode ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    attempt: row.attempt ?? 0,
    maxAttempts: row.maxAttempts ?? 3,
    heartbeatAt: row.heartbeatAt ?? null,
    leaseUntil: row.leaseUntil ?? null,
    retryAt: row.retryAt ?? null,
    cancelRequested: row.cancelRequested ?? false,
    tenantId: row.tenantId ?? null,
    correlationId: row.correlationId ?? null,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    createdTime: row.createdTime,
    updatedTime: row.updatedTime,
  };
}
