/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_CHAT_LONG_TASK_JOB,
  AiChatLongTaskService,
  retryDelay,
} from './ai-chat-long-task.service';

type AiMock = { generateText: ReturnType<typeof vi.fn> };

function buildAi(generate: (...args: never[]) => Promise<string>): AiMock {
  return { generateText: vi.fn(generate) } as unknown as AiMock;
}

function buildPrisma() {
  const now = new Date();
  return {
    aiChatSession: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(async ({ where, data }: any) => ({ ...where, ...data })),
    },
    aiChatMessage: {
      create: vi.fn(async ({ data }: any) => ({ ...data, createdTime: now })),
    },
    aiChatLongTask: {
      create: vi.fn(async ({ data }: any) => ({ ...data, createdTime: now, updatedTime: now })),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }: any) => ({ ...where, ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

function buildQueue() {
  return {
    add: vi.fn(async () => ({ id: 'job' })),
    addBulk: vi.fn(async () => undefined),
  };
}

describe('AiChatLongTaskService (durable queue + lease + idempotency)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let svc: AiChatLongTaskService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AiChatLongTaskService(prisma as never, undefined, undefined);
  });

  it('exports deterministic retry backoff', () => {
    expect(retryDelay(1)).toBe(1000);
    expect(retryDelay(2)).toBe(2000);
    expect(retryDelay(3)).toBe(4000);
    expect(retryDelay(10)).toBeLessThanOrEqual(60000);
  });

  it('enqueue throws when session is missing', async () => {
    const ai = buildAi(async () => 'x');
    const svcWithAi = new AiChatLongTaskService(prisma as never, ai as never, undefined);
    prisma.aiChatSession.findUnique.mockResolvedValueOnce(null);
    await expect(
      svcWithAi.enqueue({ sessionId: 's', userMessage: 'hi' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enqueue throws when AI provider is missing', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({ id: 's' } as never);
    await expect(
      svc.enqueue({ sessionId: 's', userMessage: 'hi' })
    ).rejects.toThrow(/AI provider is not configured/);
  });

  it('enqueue persists task row with queued status and enqueues a BullMQ job', async () => {
    const ai = buildAi(async () => 'x');
    const queue = buildQueue();
    const svcWithAi = new AiChatLongTaskService(prisma as never, ai as never, queue as never);
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'b1',
      model: 'MiniMax-M3',
      createdBy: 'usr_admin',
    } as never);
    prisma.aiChatMessage.create.mockResolvedValueOnce({
      id: 'aicm_user1',
      sessionId: 's',
      role: 'user',
      content: 'do it',
      createdTime: new Date(),
    } as never);
    prisma.aiChatLongTask.create.mockResolvedValueOnce({
      id: 'aitk_test',
      sessionId: 's',
      userMessageId: 'aicm_user1',
      status: 'queued',
      progress: 0,
      attempt: 0,
      maxAttempts: 3,
      cancelRequested: false,
      errorCode: null,
      idempotencyKey: null,
      heartbeatAt: null,
      leaseUntil: null,
      retryAt: null,
      tenantId: null,
      correlationId: null,
      result: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svcWithAi.enqueue({ sessionId: 's', userMessage: 'do it' });
    expect(out.id).toBe('aitk_test');
    expect(out.status).toBe('queued');
    expect(prisma.aiChatMessage.create).toHaveBeenCalledTimes(1);
    expect(prisma.aiChatLongTask.create).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
    const createCall = (
      prisma.aiChatLongTask.create as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][0] as { data: { id: string } };
    const expectedTaskId = createCall.data.id;
    expect(expectedTaskId.startsWith('aitk_')).toBe(true);
    const [name, payload, opts] = (
      queue.add as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0];
    expect(name).toBe(AI_CHAT_LONG_TASK_JOB);
    expect(payload).toEqual({ taskId: expectedTaskId });
    expect(opts).toMatchObject({ jobId: expectedTaskId });
  });

  it('enqueue with idempotencyKey returns the existing task and skips enqueue', async () => {
    const ai = buildAi(async () => 'x');
    const queue = buildQueue();
    const svcWithAi = new AiChatLongTaskService(prisma as never, ai as never, queue as never);
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({
      id: 's',
      baseId: 'b1',
      model: 'MiniMax-M3',
      createdBy: 'usr_admin',
    } as never);
    prisma.aiChatLongTask.findFirst.mockResolvedValueOnce({
      id: 'aitk_dup',
      sessionId: 's',
      userMessageId: 'aicm_user1',
      status: 'queued',
      progress: 0,
      attempt: 0,
      maxAttempts: 3,
      cancelRequested: false,
      errorCode: null,
      idempotencyKey: 'chat:42',
      heartbeatAt: null,
      leaseUntil: null,
      retryAt: null,
      tenantId: null,
      correlationId: null,
      result: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svcWithAi.enqueue({
      sessionId: 's',
      userMessage: 'do it',
      idempotencyKey: 'chat:42',
    });
    expect(out.id).toBe('aitk_dup');
    expect(prisma.aiChatLongTask.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('enqueue trims and rejects empty messages', async () => {
    const ai = buildAi(async () => 'x');
    const svcWithAi = new AiChatLongTaskService(prisma as never, ai as never, undefined);
    await expect(
      svcWithAi.enqueue({ sessionId: 's', userMessage: '   ' })
    ).rejects.toThrow(/cannot be empty/);
  });

  it('getTask throws when task missing', async () => {
    prisma.aiChatLongTask.findUnique.mockResolvedValueOnce(null);
    await expect(svc.getTask('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getTask maps legacy completed status to succeeded', async () => {
    prisma.aiChatLongTask.findUnique.mockResolvedValueOnce({
      id: 'aitk_1',
      sessionId: 's',
      userMessageId: 'aicm_1',
      status: 'completed',
      progress: 100,
      result: 'answer',
      errorMessage: null,
      attempt: 0,
      maxAttempts: 3,
      cancelRequested: false,
      errorCode: null,
      idempotencyKey: null,
      heartbeatAt: null,
      leaseUntil: null,
      retryAt: null,
      tenantId: null,
      correlationId: null,
      startedAt: new Date(),
      completedAt: new Date(),
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.getTask('aitk_1');
    expect(out.status).toBe('succeeded');
    expect(out.result).toBe('answer');
  });

  it('listTasks returns tasks mapped to DTOs', async () => {
    prisma.aiChatLongTask.findMany.mockResolvedValueOnce([
      {
        id: 'aitk_1',
        sessionId: 's',
        userMessageId: 'aicm_1',
        status: 'running',
        progress: 50,
        result: null,
        errorMessage: null,
        attempt: 1,
        maxAttempts: 3,
        cancelRequested: false,
        errorCode: null,
        idempotencyKey: null,
        heartbeatAt: new Date(),
        leaseUntil: new Date(),
        retryAt: null,
        tenantId: null,
        correlationId: null,
        startedAt: new Date(),
        completedAt: null,
        createdTime: new Date(),
        updatedTime: new Date(),
      },
    ] as never);
    const out = await svc.listTasks('s');
    expect(out.length).toBe(1);
    expect(out[0].status).toBe('running');
    expect(out[0].progress).toBe(50);
  });

  it('processTask transitions queued -> running -> succeeded and persists the assistant message', async () => {
    const ai = buildAi(async () => 'final result');
    const svcWithAi = new AiChatLongTaskService(prisma as never, ai as never, undefined);
    prisma.aiChatLongTask.findUnique
      .mockResolvedValueOnce({
        id: 'aitk_1',
        sessionId: 's',
        userMessageId: 'aicm_1',
        status: 'queued',
        progress: 0,
        attempt: 0,
        maxAttempts: 3,
        cancelRequested: false,
        errorCode: null,
        idempotencyKey: null,
        heartbeatAt: null,
        leaseUntil: null,
        retryAt: null,
        tenantId: null,
        correlationId: null,
        result: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdTime: new Date(),
        updatedTime: new Date(),
        session: { id: 's', baseId: 'b1', model: 'MiniMax-M3', createdBy: 'u' },
        userMessage: { id: 'aicm_1', content: 'do it' },
      } as never)
      .mockResolvedValueOnce({
        id: 'aitk_1',
        sessionId: 's',
        userMessageId: 'aicm_1',
        status: 'queued',
        progress: 0,
        attempt: 0,
        maxAttempts: 3,
        cancelRequested: false,
        errorCode: null,
        idempotencyKey: null,
        heartbeatAt: null,
        leaseUntil: null,
        retryAt: null,
        tenantId: null,
        correlationId: null,
        result: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdTime: new Date(),
        updatedTime: new Date(),
        session: { id: 's', baseId: 'b1', model: 'MiniMax-M3', createdBy: 'u' },
        userMessage: { id: 'aicm_1', content: 'do it' },
      } as never);
    prisma.aiChatLongTask.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.aiChatLongTask.update
      .mockResolvedValueOnce({ id: 'aitk_1', status: 'running', progress: 35 } as never)
      .mockResolvedValueOnce({
        id: 'aitk_1',
        status: 'succeeded',
        progress: 100,
        result: 'final result',
      } as never);
    prisma.aiChatMessage.create.mockResolvedValueOnce({ id: 'aicm_2' } as never);
    prisma.aiChatSession.update.mockResolvedValueOnce({ id: 's' } as never);
    const out = await svcWithAi.processTask('aitk_1');
    expect(out.status).toBe('succeeded');
    expect(out.result).toBe('final result');
    expect(ai.generateText).toHaveBeenCalledTimes(1);
    expect(prisma.aiChatMessage.create).toHaveBeenCalledTimes(1);
  });

  it('processTask transitions to failed when AI provider throws and no retries remain', async () => {
    const ai = buildAi(async () => {
      throw new Error('LLM down');
    });
    const svcWithAi = new AiChatLongTaskService(prisma as never, ai as never, undefined);
    const running = {
      id: 'aitk_1',
      sessionId: 's',
      userMessageId: 'aicm_1',
      status: 'running',
      progress: 0,
      attempt: 1,
      maxAttempts: 1,
      cancelRequested: false,
      errorCode: null,
      idempotencyKey: null,
      heartbeatAt: null,
      leaseUntil: null,
      retryAt: null,
      tenantId: null,
      correlationId: null,
      result: null,
      errorMessage: null,
      startedAt: new Date(),
      completedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
      session: { id: 's', baseId: 'b1', model: 'MiniMax-M3', createdBy: 'u' },
      userMessage: { id: 'aicm_1', content: 'do it' },
    };
    prisma.aiChatLongTask.findUnique
      .mockResolvedValueOnce({ ...running, status: 'queued', attempt: 0, maxAttempts: 1 } as never)
      .mockResolvedValueOnce(running as never)
      .mockResolvedValueOnce(running as never)
      .mockResolvedValueOnce(running as never);
    prisma.aiChatLongTask.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.aiChatLongTask.update.mockResolvedValueOnce({
      id: 'aitk_1',
      status: 'failed',
      errorCode: 'AI_PROVIDER_ERROR',
      errorMessage: 'LLM down',
    } as never);
    const out = await svcWithAi.processTask('aitk_1');
    expect(out.status).toBe('failed');
    expect(out.errorMessage).toBe('LLM down');
    expect(out.errorCode).toBe('AI_PROVIDER_ERROR');
  });

  it('processTask honors cancelRequested and finalizes as canceled without running the model', async () => {
    const ai = buildAi(async () => 'unused');
    const svcWithAi = new AiChatLongTaskService(prisma as never, ai as never, undefined);
    prisma.aiChatLongTask.findUnique.mockResolvedValueOnce({
      id: 'aitk_1',
      sessionId: 's',
      userMessageId: 'aicm_1',
      status: 'canceled',
      cancelRequested: true,
      progress: 0,
      attempt: 0,
      maxAttempts: 3,
      errorCode: null,
      idempotencyKey: null,
      heartbeatAt: null,
      leaseUntil: null,
      retryAt: null,
      tenantId: null,
      correlationId: null,
      result: null,
      errorMessage: null,
      startedAt: null,
      completedAt: new Date(),
      createdTime: new Date(),
      updatedTime: new Date(),
      session: { id: 's', baseId: 'b1', model: 'MiniMax-M3', createdBy: 'u' },
      userMessage: { id: 'aicm_1', content: 'do it' },
    } as never);
    prisma.aiChatLongTask.update.mockResolvedValueOnce({
      id: 'aitk_1',
      status: 'canceled',
    } as never);
    const out = await svcWithAi.processTask('aitk_1');
    expect(out.status).toBe('canceled');
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it('processTask lease contention (claim fails) returns the current row without re-running', async () => {
    const ai = buildAi(async () => 'should not run');
    const svcWithAi = new AiChatLongTaskService(prisma as never, ai as never, undefined);
    prisma.aiChatLongTask.findUnique
      .mockResolvedValueOnce({
        id: 'aitk_1',
        sessionId: 's',
        userMessageId: 'aicm_1',
        status: 'queued',
        cancelRequested: false,
        progress: 0,
        attempt: 0,
        maxAttempts: 3,
        errorCode: null,
        idempotencyKey: null,
        heartbeatAt: null,
        leaseUntil: null,
        retryAt: null,
        tenantId: null,
        correlationId: null,
        result: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdTime: new Date(),
        updatedTime: new Date(),
        session: { id: 's', baseId: 'b1', model: 'MiniMax-M3', createdBy: 'u' },
        userMessage: { id: 'aicm_1', content: 'do it' },
      } as never)
      .mockResolvedValueOnce({
        id: 'aitk_1',
        status: 'running',
        progress: 30,
      } as never);
    prisma.aiChatLongTask.updateMany.mockResolvedValueOnce({ count: 0 });
    const out = await svcWithAi.processTask('aitk_1');
    expect(out.status).toBe('running');
    expect(ai.generateText).not.toHaveBeenCalled();
  });

  it('processTask with retries remaining re-queues a delayed BullMQ job instead of failing', async () => {
    const ai = buildAi(async () => {
      throw new Error('flaky');
    });
    const queue = buildQueue();
    const svcWithAi = new AiChatLongTaskService(prisma as never, ai as never, queue as never);
    prisma.aiChatLongTask.findUnique
      .mockResolvedValueOnce({
        id: 'aitk_1',
        sessionId: 's',
        userMessageId: 'aicm_1',
        status: 'queued',
        cancelRequested: false,
        progress: 0,
        attempt: 0,
        maxAttempts: 3,
        errorCode: null,
        idempotencyKey: null,
        heartbeatAt: null,
        leaseUntil: null,
        retryAt: null,
        tenantId: null,
        correlationId: null,
        result: null,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        createdTime: new Date(),
        updatedTime: new Date(),
        session: { id: 's', baseId: 'b1', model: 'MiniMax-M3', createdBy: 'u' },
        userMessage: { id: 'aicm_1', content: 'do it' },
      } as never)
      .mockResolvedValueOnce({
        id: 'aitk_1',
        status: 'running',
        attempt: 1,
        maxAttempts: 3,
        cancelRequested: false,
      } as never);
    prisma.aiChatLongTask.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.aiChatLongTask.update.mockResolvedValueOnce({
      id: 'aitk_1',
      status: 'queued',
      errorCode: 'AI_PROVIDER_ERROR',
      errorMessage: 'flaky',
    } as never);
    const out = await svcWithAi.processTask('aitk_1');
    expect(out.status).toBe('queued');
    expect(out.errorCode).toBe('AI_PROVIDER_ERROR');
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = (
      queue.add as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0];
    expect(name).toBe(AI_CHAT_LONG_TASK_JOB);
    expect(payload).toEqual({ taskId: 'aitk_1' });
    expect((opts as { delay?: number }).delay).toBeGreaterThan(0);
  });

  it('cancelTask sets cancelRequested and finalizes running/queued tasks as canceled', async () => {
    prisma.aiChatLongTask.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.aiChatLongTask.findUnique.mockResolvedValueOnce({
      id: 'aitk_1',
      sessionId: 's',
      userMessageId: 'aicm_1',
      status: 'canceled',
      cancelRequested: true,
      progress: 30,
      attempt: 1,
      maxAttempts: 3,
      errorCode: 'TASK_CANCELED',
      errorMessage: null,
      idempotencyKey: null,
      heartbeatAt: null,
      leaseUntil: null,
      retryAt: null,
      tenantId: null,
      correlationId: null,
      result: null,
      startedAt: null,
      completedAt: new Date(),
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.cancelTask('aitk_1');
    expect(out.status).toBe('canceled');
    expect(out.cancelRequested).toBe(true);
  });

  it('recoverExpiredTasks returns expired running tasks to queued and re-enqueues them', async () => {
    const queue = buildQueue();
    const svcWithQueue = new AiChatLongTaskService(prisma as never, undefined, queue as never);
    prisma.aiChatLongTask.updateMany.mockResolvedValueOnce({ count: 2 });
    prisma.aiChatLongTask.findMany.mockResolvedValueOnce([
      { id: 'aitk_a' },
      { id: 'aitk_b' },
    ] as never);
    const recovered = await svcWithQueue.recoverExpiredTasks();
    expect(recovered).toBe(2);
    expect(queue.addBulk).toHaveBeenCalledTimes(1);
    const bulkArg = (
      queue.addBulk as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][0] as { name: string; data: { taskId: string } }[];
    expect(bulkArg[0].name).toBe(AI_CHAT_LONG_TASK_JOB);
    expect(bulkArg[0].data.taskId).toBe('aitk_a');
    expect(bulkArg[1].data.taskId).toBe('aitk_b');
  });
});
