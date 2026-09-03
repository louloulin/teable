/**
 * AI Chat message queue service (Stage 60 — Cloud §ai/ai-chat 消息队列).
 *
 * Lets the user enqueue user messages while the AI is busy. After each
 * chat turn, the auth service drains the queue (next pending message by
 * `position`) and runs it through the same prompt pipeline. Users can
 * cancel a pending message or reorder the queue at any time.
 *
 * State machine:
 *   pending  → processing → done
 *                         ↘ failed
 *            any state   → cancelled (only from pending by user action)
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

export type QueueStatus = 'pending' | 'processing' | 'done' | 'failed' | 'cancelled';

export interface IAiChatQueuedMessage {
  id: string;
  sessionId: string;
  userMessage: string;
  position: number;
  status: QueueStatus;
  resultMessageId: string | null;
  errorMessage: string | null;
  createdTime: Date;
  updatedTime: Date;
}

const QUEUE_ID_PREFIX = 'aicq';
const MAX_USER_MESSAGE_LEN = 8000;

@Injectable()
export class AiChatQueueService {
  private readonly logger = new Logger(AiChatQueueService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Enqueue a new user message. Position auto-increments to the end of the
   * pending queue.
   */
  async enqueue(input: { sessionId: string; userMessage: string }): Promise<IAiChatQueuedMessage> {
    const trimmed = input.userMessage.trim().slice(0, MAX_USER_MESSAGE_LEN);
    if (!trimmed) throw new Error('userMessage cannot be empty');
    const session = await this.prisma.aiChatSession.findUnique({ where: { id: input.sessionId } });
    if (!session) throw new NotFoundException(`chat session not found: ${input.sessionId}`);

    const last = await this.prisma.aiChatQueuedMessage.findFirst({
      where: { sessionId: input.sessionId, status: 'pending' },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const id = `${QUEUE_ID_PREFIX}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.aiChatQueuedMessage.create({
      data: {
        id,
        sessionId: input.sessionId,
        userMessage: trimmed,
        position: (last?.position ?? -1) + 1,
        status: 'pending',
      },
    });
    return toDto(row);
  }

  /** List queue items for a session, ordered by position ascending. */
  async list(sessionId: string): Promise<IAiChatQueuedMessage[]> {
    const rows = await this.prisma.aiChatQueuedMessage.findMany({
      where: { sessionId },
      orderBy: [{ status: 'asc' }, { position: 'asc' }],
      take: 100,
    });
    return rows.map(toDto);
  }

  async get(queueId: string): Promise<IAiChatQueuedMessage> {
    const row = await this.prisma.aiChatQueuedMessage.findUnique({ where: { id: queueId } });
    if (!row) throw new NotFoundException(`queued message not found: ${queueId}`);
    return toDto(row);
  }

  /** Cancel a pending queued message. Throws if not pending. */
  async cancel(queueId: string): Promise<IAiChatQueuedMessage> {
    const existing = await this.prisma.aiChatQueuedMessage.findUnique({ where: { id: queueId } });
    if (!existing) throw new NotFoundException(`queued message not found: ${queueId}`);
    if (existing.status !== 'pending') {
      throw new NotFoundException(`queued message not pending: status=${existing.status}`);
    }
    const row = await this.prisma.aiChatQueuedMessage.update({
      where: { id: queueId },
      data: { status: 'cancelled' },
    });
    return toDto(row);
  }

  /**
   * Reorder pending messages. Caller provides the queue IDs in the new
   * desired order; non-pending rows keep their position.
   */
  async reorder(
    sessionId: string,
    queueIdsInOrder: ReadonlyArray<string>
  ): Promise<IAiChatQueuedMessage[]> {
    // Validate all queue IDs exist and belong to this session
    const existing = await this.prisma.aiChatQueuedMessage.findMany({
      where: { sessionId, status: 'pending' },
      select: { id: true },
    });
    const knownIds = new Set(existing.map((r) => r.id));
    for (const id of queueIdsInOrder) {
      if (!knownIds.has(id)) {
        throw new NotFoundException(`pending queue id ${id} not found in session ${sessionId}`);
      }
    }

    // Update each position
    for (let i = 0; i < queueIdsInOrder.length; i += 1) {
      const id = queueIdsInOrder[i];
      if (!id) continue;
      await this.prisma.aiChatQueuedMessage.update({
        where: { id },
        data: { position: i },
      });
    }
    return this.list(sessionId);
  }

  /**
   * Pop the next pending message and mark it as processing. Returns null
   * when the queue is empty. Used by `AiChatAuthService` after each turn.
   */
  async popNextPending(sessionId: string): Promise<IAiChatQueuedMessage | null> {
    const row = await this.prisma.aiChatQueuedMessage.findFirst({
      where: { sessionId, status: 'pending' },
      orderBy: { position: 'asc' },
    });
    if (!row) return null;
    const updated = await this.prisma.aiChatQueuedMessage.update({
      where: { id: row.id },
      data: { status: 'processing' },
    });
    return toDto(updated);
  }

  /** Mark a queue item as done with the resulting assistant message id. */
  async markDone(queueId: string, resultMessageId: string): Promise<IAiChatQueuedMessage> {
    const row = await this.prisma.aiChatQueuedMessage.update({
      where: { id: queueId },
      data: { status: 'done', resultMessageId, updatedTime: new Date() },
    });
    return toDto(row);
  }

  /** Mark a queue item as failed with an error message. */
  async markFailed(queueId: string, errorMessage: string): Promise<IAiChatQueuedMessage> {
    const row = await this.prisma.aiChatQueuedMessage.update({
      where: { id: queueId },
      data: { status: 'failed', errorMessage, updatedTime: new Date() },
    });
    return toDto(row);
  }
}

function toDto(row: {
  id: string;
  sessionId: string;
  userMessage: string;
  position: number;
  status: string;
  resultMessageId: string | null;
  errorMessage: string | null;
  createdTime: Date;
  updatedTime: Date;
}): IAiChatQueuedMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    userMessage: row.userMessage,
    position: row.position,
    status: row.status as QueueStatus,
    resultMessageId: row.resultMessageId,
    errorMessage: row.errorMessage,
    createdTime: row.createdTime,
    updatedTime: row.updatedTime,
  };
}
