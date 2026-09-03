/**
 * Source-import service spec (Cloud §migrations — Phase 1 unified pipeline).
 */
import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SOURCE_IMPORT_JOB,
  SOURCE_IMPORT_QUEUE,
  SourceImportService,
} from './source-import.service';

interface IMockTaskTable {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  updateMany: ReturnType<typeof vi.fn>;
}

function buildPrisma() {
  return {
    sourceImportTask: {
      create: vi.fn(async ({ data }: any) => ({
        ...data,
        createdTime: new Date(),
        updatedTime: new Date(),
      })),
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      update: vi.fn(async ({ where, data }: any) => ({ ...where, ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    } satisfies IMockTaskTable,
  };
}

function buildQueue() {
  return {
    add: vi.fn(async () => ({ id: 'job' })),
    addBulk: vi.fn(async () => undefined),
  };
}

describe('SourceImportService (unified durable task)', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let queue: ReturnType<typeof buildQueue>;
  let svc: SourceImportService;

  beforeEach(() => {
    prisma = buildPrisma();
    queue = buildQueue();
    svc = new SourceImportService(prisma as never, queue as never);
  });

  it('enqueue creates a queued task and enqueues a BullMQ job', async () => {
    prisma.sourceImportTask.create.mockResolvedValueOnce({
      id: 'sit_x',
      source: 'notion',
      spaceId: 'sp',
      tableId: 'tbl',
      remoteId: 'db',
      triggeredBy: null,
      idempotencyKey: null,
      tenantId: null,
      correlationId: null,
      status: 'queued',
      attempt: 0,
      maxAttempts: 3,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      cancelRequested: false,
      lastError: null,
      errorCode: null,
      startedAt: null,
      finishedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.enqueue({
      source: 'notion',
      spaceId: 'sp',
      tableId: 'tbl',
      remoteId: 'db',
    });
    expect(out.status).toBe('queued');
    expect(queue.add).toHaveBeenCalledTimes(1);
    const [name, payload, opts] = (queue.add as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    expect(name).toBe(SOURCE_IMPORT_JOB);
    expect(payload).toEqual({ taskId: 'sit_x' });
    expect(opts).toMatchObject({ jobId: 'sit_x' });
  });

  it('enqueue dedupes when idempotencyKey already exists', async () => {
    prisma.sourceImportTask.findFirst.mockResolvedValueOnce({
      id: 'sit_dup',
      source: 'notion',
      spaceId: 'sp',
      tableId: 'tbl',
      remoteId: 'db',
      triggeredBy: null,
      idempotencyKey: 'notion:sp:db:v1',
      tenantId: null,
      correlationId: null,
      status: 'running',
      attempt: 1,
      maxAttempts: 3,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      cancelRequested: false,
      lastError: null,
      errorCode: null,
      startedAt: null,
      finishedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.enqueue({
      source: 'notion',
      spaceId: 'sp',
      tableId: 'tbl',
      remoteId: 'db',
      idempotencyKey: 'notion:sp:db:v1',
    });
    expect(out.id).toBe('sit_dup');
    expect(prisma.sourceImportTask.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('processTask short-circuits when the row is already terminal', async () => {
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      id: 'sit_done',
      source: 'notion',
      spaceId: null,
      tableId: null,
      remoteId: null,
      triggeredBy: null,
      idempotencyKey: null,
      tenantId: null,
      correlationId: null,
      status: 'succeeded',
      attempt: 1,
      maxAttempts: 3,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      cancelRequested: false,
      lastError: null,
      errorCode: null,
      startedAt: null,
      finishedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.processTask('sit_done');
    expect(out.status).toBe('succeeded');
    expect(prisma.sourceImportTask.updateMany).not.toHaveBeenCalled();
  });

  it('processTask claims the lease for queued rows', async () => {
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      id: 'sit_q',
      source: 'notion',
      spaceId: 'sp',
      tableId: 'tbl',
      remoteId: 'db',
      triggeredBy: null,
      idempotencyKey: null,
      tenantId: null,
      correlationId: null,
      status: 'queued',
      attempt: 0,
      maxAttempts: 3,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      cancelRequested: false,
      lastError: null,
      errorCode: null,
      startedAt: null,
      finishedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.sourceImportTask.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      id: 'sit_q',
      source: 'notion',
      status: 'running',
      attempt: 1,
      maxAttempts: 3,
      cancelRequested: false,
      spaceId: 'sp',
      tableId: 'tbl',
      remoteId: 'db',
      triggeredBy: null,
      idempotencyKey: null,
      tenantId: null,
      correlationId: null,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      lastError: null,
      errorCode: null,
      startedAt: new Date(),
      finishedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.processTask('sit_q');
    expect(out.status).toBe('running');
    const claim = (
      prisma.sourceImportTask.updateMany as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(claim.data).toMatchObject({ status: 'running' });
  });

  it('cancelTask finalizes queued/running tasks with errorCode=TASK_CANCELED', async () => {
    prisma.sourceImportTask.updateMany.mockResolvedValueOnce({ count: 1 });
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      id: 'sit_c',
      source: 'notion',
      spaceId: null,
      tableId: null,
      remoteId: null,
      triggeredBy: null,
      idempotencyKey: null,
      tenantId: null,
      correlationId: null,
      status: 'canceled',
      attempt: 1,
      maxAttempts: 3,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      cancelRequested: true,
      lastError: null,
      errorCode: 'TASK_CANCELED',
      startedAt: null,
      finishedAt: new Date(),
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.cancelTask('sit_c');
    expect(out.status).toBe('canceled');
    const cancel = (
      prisma.sourceImportTask.updateMany as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(cancel.data).toMatchObject({
      status: 'canceled',
      cancelRequested: true,
      errorCode: 'TASK_CANCELED',
    });
  });

  it('markSucceeded honors cancelRequested mid-flight', async () => {
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      id: 'sit_mid',
      cancelRequested: true,
      attempt: 1,
      maxAttempts: 3,
      status: 'running',
      spaceId: null,
      tableId: null,
      remoteId: null,
      triggeredBy: null,
      idempotencyKey: null,
      tenantId: null,
      correlationId: null,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      lastError: null,
      errorCode: null,
      startedAt: null,
      finishedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.sourceImportTask.update.mockResolvedValueOnce({
      id: 'sit_mid',
      status: 'canceled',
    } as never);
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      id: 'sit_mid',
      source: 'notion',
      spaceId: null,
      baseId: null,
      tableId: null,
      remoteId: null,
      triggeredBy: null,
      idempotencyKey: null,
      tenantId: null,
      correlationId: null,
      status: 'canceled',
      attempt: 1,
      maxAttempts: 3,
      totalCount: 10,
      processedCount: 10,
      failedCount: 0,
      cancelRequested: true,
      lastError: null,
      errorCode: 'TASK_CANCELED',
      startedAt: null,
      finishedAt: new Date(),
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    const out = await svc.markSucceeded('sit_mid', {
      processedCount: 10,
      failedCount: 0,
      totalCount: 10,
    });
    expect(out.status).toBe('canceled');
  });

  it('markFailed schedules a retry when attempts remain', async () => {
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      id: 'sit_r',
      attempt: 1,
      maxAttempts: 3,
      status: 'running',
      spaceId: null,
      tableId: null,
      remoteId: null,
      triggeredBy: null,
      idempotencyKey: null,
      tenantId: null,
      correlationId: null,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      cancelRequested: false,
      lastError: null,
      errorCode: null,
      startedAt: null,
      finishedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    prisma.sourceImportTask.update.mockResolvedValueOnce({
      id: 'sit_r',
      status: 'queued',
    } as never);
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      id: 'sit_r',
      source: 'notion',
      spaceId: null,
      baseId: null,
      tableId: null,
      remoteId: null,
      triggeredBy: null,
      idempotencyKey: null,
      tenantId: null,
      correlationId: null,
      status: 'queued',
      attempt: 1,
      maxAttempts: 3,
      totalCount: 0,
      processedCount: 0,
      failedCount: 0,
      cancelRequested: false,
      lastError: 'flaky',
      errorCode: 'TRANSIENT',
      startedAt: null,
      finishedAt: null,
      createdTime: new Date(),
      updatedTime: new Date(),
    } as never);
    await svc.markFailed('sit_r', { code: 'TRANSIENT', message: 'flaky' });
    const call = (
      prisma.sourceImportTask.update as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(call.data).toMatchObject({
      status: 'queued',
      errorCode: 'TRANSIENT',
    });
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect((queue.add as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBe('process');
  });

  it('recoverExpired returns running tasks to queued and bulk-enqueues them', async () => {
    prisma.sourceImportTask.updateMany.mockResolvedValueOnce({ count: 2 });
    prisma.sourceImportTask.findMany.mockResolvedValueOnce([
      { id: 'sit_a' },
      { id: 'sit_b' },
    ] as never);
    const recovered = await svc.recoverExpired();
    expect(recovered).toBe(2);
    expect(queue.addBulk).toHaveBeenCalledTimes(1);
    const bulk = (queue.addBulk as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Array<{
      name: string;
      data: { taskId: string };
    }>;
    expect(bulk.map((b) => b.data.taskId)).toEqual(['sit_a', 'sit_b']);
    expect(bulk[0].name).toBe(SOURCE_IMPORT_JOB);
  });

  it('exports the unified queue + job names', () => {
    expect(SOURCE_IMPORT_QUEUE).toBe('source-import-queue');
    expect(SOURCE_IMPORT_JOB).toBe('process');
  });

  it('getTask throws when task is missing', async () => {
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce(null);
    await expect(svc.getTask('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('isCanceled returns true when cancelRequested is set', async () => {
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      cancelRequested: true,
      status: 'running',
    } as never);
    await expect(svc.isCanceled('sit_x')).resolves.toBe(true);
  });

  it('isCanceled returns true when status is already canceled', async () => {
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      cancelRequested: false,
      status: 'canceled',
    } as never);
    await expect(svc.isCanceled('sit_x')).resolves.toBe(true);
  });

  it('isCanceled returns false for running tasks without cancelRequested', async () => {
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce({
      cancelRequested: false,
      status: 'running',
    } as never);
    await expect(svc.isCanceled('sit_x')).resolves.toBe(false);
  });

  it('isCanceled returns true when the task row is gone', async () => {
    prisma.sourceImportTask.findUnique.mockResolvedValueOnce(null);
    await expect(svc.isCanceled('sit_missing')).resolves.toBe(true);
  });

  it('updateProgress refreshes lease + heartbeat and sticks totalCount', async () => {
    prisma.sourceImportTask.update.mockResolvedValueOnce({ id: 'sit_x' } as never);
    await svc.updateProgress('sit_x', { processedCount: 50, failedCount: 3, totalCount: 200 });
    const update = (
      prisma.sourceImportTask.update as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(update.data).toMatchObject({
      processedCount: 50,
      failedCount: 3,
    });
    expect(update.data['heartbeatAt']).toBeInstanceOf(Date);
    expect(update.data['leaseUntil']).toBeInstanceOf(Date);
    // totalCount uses { set: ... } (sticky)
    expect(update.data['totalCount']).toEqual({ set: 200 });
  });
});
