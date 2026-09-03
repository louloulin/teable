/**
 * Unified source-import service — durable task protocol.
 *
 * Shared with AI Chat long task, AI Field batch, and Stripe webhook
 * events. Owns:
 *   - task row lifecycle (queued/running/succeeded/failed/canceled)
 *   - idempotency lookup via (source, idempotencyKey)
 *   - 5-minute lease + 30-second heartbeat
 *   - exponential retry with backoff
 *   - worker crash recovery on startup
 *   - cancel-before-claim semantics
 *
 * The actual record fetch + write is delegated to a SourceImportDriver.
 */
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import type { Queue } from 'bullmq';

export const SOURCE_IMPORT_QUEUE = 'source-import-queue';
export const SOURCE_IMPORT_JOB = 'process';
export const SOURCE_IMPORT_LEASE_MS = 5 * 60 * 1000;
export const SOURCE_IMPORT_HEARTBEAT_MS = 30 * 1000;

export type SourceImportStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';

export interface ISourceImportTask {
  id: string;
  source: string;
  spaceId: string | null;
  baseId: string | null;
  tableId: string | null;
  remoteId: string | null;
  triggeredBy: string | null;
  status: SourceImportStatus;
  attempt: number;
  maxAttempts: number;
  totalCount: number;
  processedCount: number;
  failedCount: number;
  cancelRequested: boolean;
  lastError: string | null;
  errorCode: string | null;
  idempotencyKey: string | null;
  tenantId: string | null;
  correlationId: string | null;
  /** Free-form payload carried from `enqueue`; sources (e.g. Airtable) read
   *  credentials and per-task options from here. */
  payload: Record<string, unknown> | null;
  /** Final driver result captured at `markSucceeded`. */
  result: Record<string, unknown> | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdTime: Date;
  updatedTime: Date;
}

export interface ISourceImportJob {
  taskId: string;
}

const LEGACY_STATUS_MAP: Record<string, SourceImportStatus> = {
  pending: 'queued',
  completed: 'succeeded',
  cancelled: 'canceled',
};

@Injectable()
export class SourceImportService {
  private readonly logger = new Logger(SourceImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @InjectQueue(SOURCE_IMPORT_QUEUE)
    private readonly queue?: Queue<ISourceImportJob>
  ) {}

  async enqueue(input: {
    source: string;
    spaceId: string;
    /** Optional target Teable base id. Airtable uses this when adding
     *  tables into an existing base; Notion ignores it. */
    baseId?: string;
    /** Optional target Teable table id. Notion requires it; Airtable
     *  ignores it because it creates new tables as part of base import. */
    tableId?: string;
    remoteId: string;
    triggeredBy?: string;
    idempotencyKey?: string;
    tenantId?: string;
    correlationId?: string;
    maxAttempts?: number;
    payload?: Record<string, unknown>;
  }): Promise<ISourceImportTask> {
    const idempotencyKey = input.idempotencyKey?.trim().slice(0, 200) || undefined;
    if (idempotencyKey) {
      const existing = await this.prisma.sourceImportTask.findFirst({
        where: { source: input.source, idempotencyKey },
      });
      if (existing) return this.toDto(existing);
    }
    const taskId = `sit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = await this.prisma.sourceImportTask.create({
      data: {
        id: taskId,
        source: input.source,
        idempotencyKey,
        spaceId: input.spaceId,
        baseId: input.baseId,
        tableId: input.tableId,
        remoteId: input.remoteId,
        triggeredBy: input.triggeredBy,
        tenantId: input.tenantId,
        correlationId: input.correlationId,
        status: 'queued',
        maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 3, 5)),
        payload: (input.payload as never) ?? undefined,
      },
    });
    if (this.queue) {
      await this.queue.add(
        SOURCE_IMPORT_JOB,
        { taskId: row.id },
        { jobId: row.id, removeOnComplete: 2000, removeOnFail: 5000 }
      );
    }
    return this.toDto(row);
  }

  async getTask(taskId: string): Promise<ISourceImportTask> {
    const row = await this.prisma.sourceImportTask.findUnique({ where: { id: taskId } });
    if (!row) throw new NotFoundException(`source import task not found: ${taskId}`);
    return this.toDto(row);
  }

  async listTasks(input: { source?: string; take?: number }): Promise<ISourceImportTask[]> {
    const rows = await this.prisma.sourceImportTask.findMany({
      where: input.source ? { source: input.source } : undefined,
      orderBy: { createdTime: 'desc' },
      take: input.take ?? 20,
    });
    return rows.map((row) => this.toDto(row));
  }

  async cancelTask(taskId: string): Promise<ISourceImportTask> {
    const claimed = await this.prisma.sourceImportTask.updateMany({
      where: { id: taskId, status: { in: ['queued', 'running'] }, cancelRequested: false },
      data: {
        cancelRequested: true,
        status: 'canceled',
        finishedAt: new Date(),
        leaseUntil: null,
        errorCode: 'TASK_CANCELED',
      },
    });
    void claimed;
    return this.getTask(taskId);
  }

  /**
   * Worker-facing predicate that drivers call between batches to honor a
   * user-initiated cancel without re-implementing cancellation. Reads
   * the row's `cancelRequested` flag (which `cancelTask` flips from any
   * process) and treats terminal states as canceled so a concurrent
   * `cancelTask` racing with `markSucceeded` always wins.
   */
  async isCanceled(taskId: string): Promise<boolean> {
    const row = await this.prisma.sourceImportTask.findUnique({
      where: { id: taskId },
      select: { cancelRequested: true, status: true },
    });
    if (!row) return true;
    return row.cancelRequested || row.status === 'canceled';
  }

  /**
   * Worker-facing progress writer. Refreshes the heartbeat lease window
   * every time it's called so long-running imports can exceed a single
   * lease interval without losing the lock. The `totalCount` is sticky
   * — it tracks the largest reported value, so partial counts do not
   * shrink the visible total once the driver has discovered more rows.
   */
  async updateProgress(
    taskId: string,
    counts: { processedCount: number; failedCount: number; totalCount: number }
  ): Promise<void> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + SOURCE_IMPORT_LEASE_MS);
    await this.prisma.sourceImportTask.update({
      where: { id: taskId },
      data: {
        processedCount: counts.processedCount,
        failedCount: counts.failedCount,
        totalCount: { set: counts.totalCount },
        heartbeatAt: now,
        leaseUntil,
      },
    });
  }

  /** Worker entry point. Acquires the lease and returns. Driver
   *  integration is wired by the import-jobs processor module. */
  async processTask(taskId: string): Promise<ISourceImportTask> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + SOURCE_IMPORT_LEASE_MS);
    const existing = await this.prisma.sourceImportTask.findUnique({ where: { id: taskId } });
    if (!existing) throw new NotFoundException(`source import task not found: ${taskId}`);
    if (existing.status === 'succeeded' || existing.status === 'canceled') {
      return this.toDto(existing);
    }
    if (existing.cancelRequested && existing.status !== 'running') {
      await this.prisma.sourceImportTask.update({
        where: { id: taskId },
        data: { status: 'canceled', finishedAt: existing.finishedAt ?? now, leaseUntil: null },
      });
      return this.getTask(taskId);
    }
    const claimed = await this.prisma.sourceImportTask.updateMany({
      where: {
        id: taskId,
        OR: [{ status: 'queued' }, { status: 'running', leaseUntil: { lt: now } }],
        cancelRequested: false,
      },
      data: {
        status: 'running',
        startedAt: existing.startedAt ?? now,
        heartbeatAt: now,
        leaseUntil,
        attempt: { increment: 1 },
      },
    });
    if (claimed.count === 0) return this.getTask(taskId);
    return this.getTask(taskId);
  }

  async markSucceeded(
    taskId: string,
    result: {
      processedCount: number;
      failedCount: number;
      totalCount: number;
      result?: unknown;
    }
  ): Promise<ISourceImportTask> {
    const fresh = await this.prisma.sourceImportTask.findUnique({ where: { id: taskId } });
    if (!fresh) throw new NotFoundException(`source import task not found: ${taskId}`);
    if (fresh.cancelRequested) {
      await this.prisma.sourceImportTask.update({
        where: { id: taskId },
        data: {
          status: 'canceled',
          processedCount: result.processedCount,
          failedCount: result.failedCount,
          totalCount: result.totalCount,
          finishedAt: new Date(),
          leaseUntil: null,
          errorCode: 'TASK_CANCELED',
        },
      });
      return this.getTask(taskId);
    }
    await this.prisma.sourceImportTask.update({
      where: { id: taskId },
      data: {
        status: 'succeeded',
        processedCount: result.processedCount,
        failedCount: result.failedCount,
        totalCount: result.totalCount,
        result: (result.result as never) ?? undefined,
        finishedAt: new Date(),
        heartbeatAt: new Date(),
        leaseUntil: null,
        retryAt: null,
        lastError: null,
        errorCode: null,
      },
    });
    return this.getTask(taskId);
  }

  async markFailed(
    taskId: string,
    error: { code?: string; message: string; retryable?: boolean }
  ): Promise<ISourceImportTask> {
    const fresh = await this.prisma.sourceImportTask.findUnique({ where: { id: taskId } });
    if (!fresh) throw new NotFoundException(`source import task not found: ${taskId}`);
    const retryable = error.retryable !== false && fresh.attempt < fresh.maxAttempts;
    await this.prisma.sourceImportTask.update({
      where: { id: taskId },
      data: {
        status: retryable ? 'queued' : 'failed',
        retryAt: retryable ? new Date(Date.now() + this.retryDelayMs(fresh.attempt)) : null,
        finishedAt: retryable ? null : new Date(),
        lastError: error.message.slice(0, 2000),
        errorCode: error.code ?? (retryable ? 'TRANSIENT_IMPORT_ERROR' : 'IMPORT_FAILED'),
        heartbeatAt: new Date(),
        leaseUntil: null,
      },
    });
    if (retryable && this.queue) {
      await this.queue.add(
        SOURCE_IMPORT_JOB,
        { taskId },
        {
          jobId: `${taskId}:retry:${fresh.attempt}`,
          delay: this.retryDelayMs(fresh.attempt),
        }
      );
    }
    return this.getTask(taskId);
  }

  async recoverExpired(): Promise<number> {
    const now = new Date();
    const recovered = await this.prisma.sourceImportTask.updateMany({
      where: {
        status: 'running',
        leaseUntil: { lt: now },
        cancelRequested: false,
      },
      data: { status: 'queued', retryAt: now, leaseUntil: null, heartbeatAt: null },
    });
    if (recovered.count && this.queue) {
      const rows = await this.prisma.sourceImportTask.findMany({
        where: { status: 'queued', retryAt: now },
        select: { id: true },
      });
      await this.queue.addBulk(
        rows.map((row) => ({
          name: SOURCE_IMPORT_JOB,
          data: { taskId: row.id },
          opts: { jobId: `${row.id}:recovery` },
        }))
      );
    }
    return recovered.count;
  }

  retryDelayMs(attempt: number): number {
    return Math.min(60_000, 1000 * 2 ** Math.max(0, attempt - 1));
  }

  private toDto(row: {
    id: string;
    source: string;
    idempotencyKey: string | null;
    spaceId: string | null;
    baseId: string | null;
    tableId: string | null;
    remoteId: string | null;
    triggeredBy: string | null;
    tenantId: string | null;
    correlationId: string | null;
    payload: unknown;
    result: unknown;
    status: string;
    attempt: number;
    maxAttempts: number;
    totalCount: number;
    processedCount: number;
    failedCount: number;
    cancelRequested: boolean;
    lastError: string | null;
    errorCode: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdTime: Date;
    updatedTime: Date;
  }): ISourceImportTask {
    return {
      id: row.id,
      source: row.source,
      spaceId: row.spaceId,
      baseId: row.baseId,
      tableId: row.tableId,
      remoteId: row.remoteId,
      triggeredBy: row.triggeredBy,
      status: LEGACY_STATUS_MAP[row.status] ?? (row.status as SourceImportStatus),
      attempt: row.attempt,
      maxAttempts: row.maxAttempts,
      totalCount: row.totalCount,
      processedCount: row.processedCount,
      failedCount: row.failedCount,
      cancelRequested: row.cancelRequested,
      lastError: row.lastError,
      errorCode: row.errorCode,
      idempotencyKey: row.idempotencyKey,
      tenantId: row.tenantId,
      correlationId: row.correlationId,
      payload: (row.payload as Record<string, unknown> | null) ?? null,
      result: (row.result as Record<string, unknown> | null) ?? null,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      createdTime: row.createdTime,
      updatedTime: row.updatedTime,
    };
  }
}
