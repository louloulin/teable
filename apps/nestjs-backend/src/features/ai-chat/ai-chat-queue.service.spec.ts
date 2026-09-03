/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatQueueService } from './ai-chat-queue.service';

function buildPrisma() {
  const now = new Date();
  return {
    aiChatSession: {
      findUnique: vi.fn(async () => null),
    },
    aiChatQueuedMessage: {
      create: vi.fn(async ({ data }: any) => ({
        ...data,
        createdTime: now,
        updatedTime: now,
      })),
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      update: vi.fn(async ({ where, data: d }: any) => ({ ...where, ...d })),
    },
  };
}

describe('AiChatQueueService (Stage 60)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let svc: AiChatQueueService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new AiChatQueueService(prisma as never);
  });

  it('enqueue throws when session missing', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce(null);
    await expect(svc.enqueue({ sessionId: 's', userMessage: 'hi' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enqueue rejects empty messages', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({ id: 's' } as never);
    await expect(svc.enqueue({ sessionId: 's', userMessage: '   ' })).rejects.toThrow(/cannot be empty/);
  });

  it('enqueue starts at position 0 when queue empty', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({ id: 's' } as never);
    prisma.aiChatQueuedMessage.findFirst.mockResolvedValueOnce(null);
    prisma.aiChatQueuedMessage.create.mockImplementationOnce(async ({ data }: any) => data);
    const out = await svc.enqueue({ sessionId: 's', userMessage: 'first' });
    expect(out.position).toBe(0);
    expect(out.status).toBe('pending');
  });

  it('enqueue appends after last pending position', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({ id: 's' } as never);
    prisma.aiChatQueuedMessage.findFirst.mockResolvedValueOnce({ position: 3 } as never);
    prisma.aiChatQueuedMessage.create.mockImplementationOnce(async ({ data }: any) => data);
    const out = await svc.enqueue({ sessionId: 's', userMessage: 'next' });
    expect(out.position).toBe(4);
  });

  it('enqueue trims to MAX_USER_MESSAGE_LEN', async () => {
    prisma.aiChatSession.findUnique.mockResolvedValueOnce({ id: 's' } as never);
    prisma.aiChatQueuedMessage.findFirst.mockResolvedValueOnce(null);
    prisma.aiChatQueuedMessage.create.mockImplementationOnce(async ({ data }: any) => data);
    await svc.enqueue({ sessionId: 's', userMessage: 'x'.repeat(9000) });
    expect(prisma.aiChatQueuedMessage.create.mock.calls[0][0].data.userMessage.length).toBe(8000);
  });

  it('list returns mapped rows', async () => {
    prisma.aiChatQueuedMessage.findMany.mockResolvedValueOnce([
      { id: 'a', sessionId: 's', userMessage: 'a', position: 0, status: 'pending', resultMessageId: null, errorMessage: null, createdTime: new Date(), updatedTime: new Date() },
    ] as never);
    const out = await svc.list('s');
    expect(out.length).toBe(1);
    expect(out[0].status).toBe('pending');
  });

  it('cancel throws when queue missing', async () => {
    prisma.aiChatQueuedMessage.findUnique.mockResolvedValueOnce(null);
    await expect(svc.cancel('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancel rejects non-pending status with NotFoundException (V74 fix — idempotent 404)', async () => {
    prisma.aiChatQueuedMessage.findUnique.mockResolvedValue({
      id: 'q', status: 'done', sessionId: 's', userMessage: 'x', position: 0, resultMessageId: null, errorMessage: null, createdTime: new Date(), updatedTime: new Date(),
    } as never);
    await expect(svc.cancel('q')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.cancel('q')).rejects.toThrow(/queued message not pending/);
  });

  it('cancel sets status to cancelled', async () => {
    prisma.aiChatQueuedMessage.findUnique.mockResolvedValueOnce({
      id: 'q', status: 'pending', sessionId: 's', userMessage: 'x', position: 0, resultMessageId: null, errorMessage: null, createdTime: new Date(), updatedTime: new Date(),
    } as never);
    prisma.aiChatQueuedMessage.update.mockImplementationOnce(async ({ where, data }: any) => ({ ...where, ...data }));
    const out = await svc.cancel('q');
    expect(out.status).toBe('cancelled');
  });

  it('reorder throws on unknown id', async () => {
    prisma.aiChatQueuedMessage.findMany.mockResolvedValueOnce([{ id: 'a' }] as never);
    await expect(svc.reorder('s', ['a', 'unknown'])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reorder writes new positions and returns updated list', async () => {
    prisma.aiChatQueuedMessage.findMany
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never) // validation
      .mockResolvedValueOnce([ // final list
        { id: 'b', sessionId: 's', userMessage: 'b', position: 0, status: 'pending', resultMessageId: null, errorMessage: null, createdTime: new Date(), updatedTime: new Date() },
        { id: 'a', sessionId: 's', userMessage: 'a', position: 1, status: 'pending', resultMessageId: null, errorMessage: null, createdTime: new Date(), updatedTime: new Date() },
      ] as never);
    prisma.aiChatQueuedMessage.update.mockImplementation(async ({ where, data }: any) => ({ ...where, ...data }));
    const out = await svc.reorder('s', ['b', 'a', 'c']);
    expect(out.length).toBe(2);
    expect(prisma.aiChatQueuedMessage.update).toHaveBeenCalledTimes(3);
  });

  it('popNextPending returns null when queue empty', async () => {
    prisma.aiChatQueuedMessage.findFirst.mockResolvedValueOnce(null);
    expect(await svc.popNextPending('s')).toBeNull();
  });

  it('popNextPending marks row processing', async () => {
    prisma.aiChatQueuedMessage.findFirst.mockResolvedValueOnce({
      id: 'q', sessionId: 's', userMessage: 'hi', position: 0, status: 'pending', resultMessageId: null, errorMessage: null, createdTime: new Date(), updatedTime: new Date(),
    } as never);
    prisma.aiChatQueuedMessage.update.mockImplementationOnce(async ({ where, data }: any) => ({ ...where, ...data }));
    const out = await svc.popNextPending('s');
    expect(out?.status).toBe('processing');
  });

  it('markDone + markFailed set status and return rows', async () => {
    prisma.aiChatQueuedMessage.update.mockImplementation(async ({ where, data }: any) => ({ ...where, ...data }));
    const done = await svc.markDone('q', 'm1');
    expect(done.status).toBe('done');
    expect(done.resultMessageId).toBe('m1');
    const failed = await svc.markFailed('q', 'oops');
    expect(failed.status).toBe('failed');
    expect(failed.errorMessage).toBe('oops');
  });
});
