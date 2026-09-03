import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Readable } from 'stream';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { FieldKeyType, FieldType } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import { Task } from '@teable/openapi';
import { Events } from '../../event-emitter/events';
import {
  AI_FIELD_BATCH_HEARTBEAT_MS,
  AI_FIELD_BATCH_JOB,
  AI_FIELD_BATCH_LEASE_MS,
  AI_FIELD_BATCH_QUEUE,
} from './ai-field-batch.processor';
import { RecordCreateEvent, RecordUpdateEvent } from '../../event-emitter/events/table/record.event';
import { AttachmentsService } from '../attachments/attachments.service';
import { RecordModifyService } from '../record/record-modify/record-modify.service';
import { RecordService } from '../record/record.service';

import {
  buildAiFieldRow,
  buildDefaultPrompt,
  buildRunRow,
  buildTemplateRow,
  estimateTokens,
  foldRuns,
  guardOutput,
  hashConfig,
  isValidModel,
  isValidOperation,
  isValidStatusTransition,
  parseConfig,
  parseSourceFieldIds,
  renderPrompt,
  stringifyConfig,
  validateConfig,
} from './ai-field.service';
import type {
  AiFieldConfig,
  AiFieldOperation,
  AiFieldStatus,
  BatchTaskStatus,
  IAiField,
  IAiFieldRun,
  IAiFieldTemplate,
  IBatchGenerationInput,
  IBatchGenerationResult,
  ICustomPromptConfig,
  ICreateAiFieldInput,
  ICreateTemplateInput,
  IAiGenerationTaskRow,
  IImageConfig,
  IRunAiFieldInput,
  IUpdateAiFieldInput,
  IUsageAggregate,
} from './ai-field.types';
import { AiService } from '../ai/ai.service';

@Injectable()
export class AiFieldAuthService {
  private readonly logger = new Logger(AiFieldAuthService.name);
  private readonly inFlightRuns = new Map<string, Promise<IAiFieldRun>>();
  private activeRuns = 0;
  private readonly runWaiters: Array<() => void> = [];

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly ai?: AiService,
    @Optional() private readonly recordModifyService?: RecordModifyService,
    @Optional() private readonly attachmentsService?: AttachmentsService,
    @Optional() private readonly recordService?: RecordService,
    @Optional()
    @InjectQueue(AI_FIELD_BATCH_QUEUE)
    private readonly batchQueue?: Queue<{ taskId: string }>
  ) {}

  @OnEvent(Events.TABLE_RECORD_CREATE, { async: true })
  async onRecordCreate(event: RecordCreateEvent): Promise<void> {
    await this.processRecordEvent(event.payload.tableId, this.normalizeRecords(event.payload.record), 'create');
  }

  @OnEvent(Events.TABLE_RECORD_UPDATE, { async: true })
  async onRecordUpdate(event: RecordUpdateEvent): Promise<void> {
    await this.processRecordEvent(event.payload.tableId, this.normalizeRecords(event.payload.record), 'update');
  }

  @OnEvent(Events.OPERATION_RECORDS_CREATE, { async: true })
  async onOperationCreate(event: {
    reqParams?: { tableId?: string };
    resolveData?: { records?: unknown[] };
    reqBody?: { records?: unknown[] };
  }): Promise<void> {
    const tableId = event.reqParams?.tableId;
    if (!tableId) return;
    const records = event.resolveData?.records ?? event.reqBody?.records;
    await this.processRecordEvent(tableId, this.normalizeRecords(records), 'create');
  }

  @OnEvent(Events.OPERATION_RECORDS_UPDATE, { async: true })
  async onOperationUpdate(event: {
    reqParams?: { tableId?: string };
    resolveData?: unknown;
    reqBody?: { records?: unknown[] };
  }): Promise<void> {
    const tableId = event.reqParams?.tableId;
    if (!tableId) return;
    const records = event.resolveData ?? event.reqBody?.records;
    await this.processRecordEvent(tableId, this.normalizeRecords(records), 'update');
  }

  private async processRecordEvent(
    tableId: string,
    records: Array<{ id: string; fields: Record<string, unknown> }>,
    phase: 'create' | 'update'
  ): Promise<void> {
    if (records.length === 0) return;
    const table = await this.prisma.tableMeta.findUnique({
      where: { id: tableId },
      select: { baseId: true, fields: { select: { id: true, type: true } } },
    });
    if (!table) return;
    const aiFields = await this.prisma.aiField.findMany({
      where: { baseId: table.baseId, tableId, status: 'enabled' },
      orderBy: { createdTime: 'asc' },
    });
    if (aiFields.length === 0) return;

    for (const aiField of aiFields) {
      const targetType = table.fields?.find((field) => field.id === aiField.fieldId)?.type;
      const isImageOp = aiField.operation === 'image';
      const allowedTargets = isImageOp
        ? [FieldType.Attachment]
        : [FieldType.SingleLineText, FieldType.LongText];
      if (targetType && !allowedTargets.includes(targetType as FieldType)) {
        this.logger.warn(
          `AI field auto-trigger skipped incompatible target type table=${tableId} field=${aiField.id} target=${aiField.fieldId} type=${targetType}`
        );
        continue;
      }
      const sourceFieldIds = parseSourceFieldIds(aiField.sourceFieldIds);
      if (sourceFieldIds.length === 0) continue;
      for (const record of records) {
        if (
          phase === 'update' &&
          !sourceFieldIds.some((fieldId) => Object.prototype.hasOwnProperty.call(record.fields, fieldId))
        ) {
          continue;
        }
        const inputText = sourceFieldIds
          .map((fieldId) => this.valueToText(record.fields[fieldId]))
          .filter((value) => value.length > 0)
          .join('\n');
        if (!inputText) continue;
        try {
          const run = await this.executeRun({
            aiFieldId: aiField.id,
            recordId: record.id,
            inputText,
            rowFields: record.fields,
          });
          if (run.status === 'ok' && this.recordModifyService) {
            const fieldValue =
              aiField.operation === 'image' ? this.parseAttachmentOutput(run.outputText) : run.outputText;
            if (fieldValue !== null) {
              await this.recordModifyService.simpleUpdateRecords(tableId, {
                fieldKeyType: FieldKeyType.Id,
                typecast: false,
                records: [{ id: record.id, fields: { [aiField.fieldId]: fieldValue } }],
              });
            }
          }
        } catch (error) {
          this.logger.warn(
            `AI field auto-trigger failed table=${tableId} field=${aiField.id} record=${record.id} phase=${phase}: ${(error as Error)?.message ?? error}`
          );
        }
      }
    }
  }

  private parseAttachmentOutput(outputText: string): unknown {
    if (!outputText) return null;
    try {
      const parsed = JSON.parse(outputText);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private normalizeRecords(
    raw: unknown
  ): Array<{ id: string; fields: Record<string, unknown> }> {
    const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return items.flatMap((item) => {
      if (!item || typeof item !== 'object' || typeof (item as { id?: unknown }).id !== 'string') {
        return [];
      }
      const source = item as { id: string; fields?: Record<string, unknown> };
      const fields: Record<string, unknown> = {};
      for (const [fieldId, value] of Object.entries(source.fields ?? {})) {
        fields[fieldId] =
          value && typeof value === 'object' && 'newValue' in value
            ? (value as { newValue?: unknown }).newValue
            : value;
      }
      return [{ id: source.id, fields }];
    });
  }


  // ─── Batch generation (Cloud §field/ai/ai-field "Fill empty" / "Generate entire column") ──

  /**
   * Start a batch generation task for an AI field. Returns immediately with
   * a taskId; the actual processing runs in the background and updates the
   * `ai_generation_task` row.
   */
  async startBatchGeneration(input: IBatchGenerationInput): Promise<IBatchGenerationResult> {
    const aiField = await this.prisma.aiField.findUnique({ where: { id: input.aiFieldId } });
    if (!aiField) throw new NotFoundException(`ai field not found: ${input.aiFieldId}`);
    if (aiField.status !== 'enabled') {
      throw new BadRequestException(`ai field is ${aiField.status}; enable it first`);
    }

    // Idempotency: callers can supply a stable key to recover the existing task
    // instead of starting a new one. Runs before the active-task check so that
    // a deterministic request always maps to the same task.
    const idempotencyKey = input.idempotencyKey?.trim().slice(0, 200) || undefined;
    if (idempotencyKey) {
      const existing = await this.prisma.aiGenerationTask.findFirst({
        where: { tableId: aiField.tableId, idempotencyKey },
        orderBy: { createdTime: 'desc' },
      });
      if (existing) {
        return {
          taskId: existing.id,
          status: existing.status as IBatchGenerationResult['status'],
          totalCount: existing.totalCount,
        };
      }
    }

    // Multi-instance guard: reject if a batch task is already active for this
    // AI field. Active = status in (waiting, processing) and not cancelled.
    const activeTask = await this.prisma.aiGenerationTask.findFirst({
      where: {
        baseId: aiField.baseId,
        tableId: aiField.tableId,
        status: { in: ['waiting', 'processing'] },
        cancelRequested: false,
      },
      orderBy: { createdTime: 'desc' },
      select: { id: true, status: true, totalCount: true, trigger: true },
    });
    if (activeTask) {
      throw new ConflictException(
        `a batch task is already running for this table (taskId=${activeTask.id}, trigger=${activeTask.trigger}, status=${activeTask.status})`
      );
    }

    const taskId = `aigt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const task = await this.prisma.aiGenerationTask.create({
      data: {
        id: taskId,
        spaceId: null,
        baseId: aiField.baseId,
        tableId: aiField.tableId,
        trigger: input.mode,
        status: 'waiting',
        totalCount: 0,
        completedCount: 0,
        failedCount: 0,
        cancelRequested: false,
        idempotencyKey,
        maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 1, 5)),
        tenantId: input.tenantId,
        correlationId: input.correlationId,
      },
    });

    if (this.batchQueue) {
      await this.batchQueue.add(
        AI_FIELD_BATCH_JOB,
        { taskId: task.id },
        { jobId: task.id, removeOnComplete: 2000, removeOnFail: 5000 }
      );
    } else {
      // Fallback for tests / queues not yet bootstrapped: run inline via setImmediate.
      // The processor covers the production path.
      setImmediate(() => {
        this.processBatchTask(task.id).catch((error) => {
          this.logger.error(
            `Batch task ${task.id} crashed: ${(error as Error)?.message ?? error}`
          );
        });
      });
    }

    return { taskId: task.id, status: task.status as IBatchGenerationResult['status'], totalCount: 0 };
  }

  /** Process a batch task: iterate records, execute the AI field, write back.
   * Public so the durable worker (ai-field-batch.processor.ts) can drive it. */
  async processBatchTask(taskId: string): Promise<void> {
    const existing = await this.prisma.aiGenerationTask.findUnique({ where: { id: taskId } });
    if (!existing) return;
    if (existing.status === 'done' || existing.status === 'cancelled') return;
    const now = new Date();
    if (existing.cancelRequested && existing.status !== 'processing') {
      await this.prisma.aiGenerationTask.updateMany({
        where: { id: taskId },
        data: { status: 'cancelled', finishedTime: existing.finishedTime ?? now },
      });
      return;
    }
    const leaseUntil = new Date(now.getTime() + AI_FIELD_BATCH_LEASE_MS);
    const claimed = await this.prisma.aiGenerationTask.updateMany({
      where: {
        id: taskId,
        OR: [
          { status: 'waiting' },
          { status: 'processing', leaseUntil: { lt: now } },
        ],
      },
      data: {
        status: 'processing',
        startedTime: existing.startedTime ?? now,
        heartbeatAt: now,
        leaseUntil,
        attempt: { increment: 1 },
      },
    });
    if (claimed.count === 0) return;
    const task = await this.prisma.aiGenerationTask.findUnique({ where: { id: taskId } });
    if (!task) return;
    let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
    try {
      await this.runBatchTask(taskId);
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
    }
  }

  private async runBatchTask(taskId: string): Promise<void> {
    const heartbeatTimer = setInterval(() => {
      this.heartbeatBatchTask(taskId).catch(() => undefined);
    }, AI_FIELD_BATCH_HEARTBEAT_MS);
    try {
      const task = await this.prisma.aiGenerationTask.findUnique({ where: { id: taskId } });
      if (!task) return;
    const aiFieldRow = await this.prisma.aiField.findFirst({ where: { baseId: task.baseId, tableId: task.tableId } });
    if (!aiFieldRow) {
      await this.markTaskFailed(taskId, 'ai field not found for table');
      return;
    }
    const targetTable = await this.prisma.tableMeta.findUnique({
      where: { id: aiFieldRow.tableId },
      select: { id: true, baseId: true, fields: { select: { id: true, type: true } } },
    });
    if (!targetTable) {
      await this.markTaskFailed(taskId, 'table not found');
      return;
    }

    const records = await this.fetchBatchRecords(targetTable, aiFieldRow as unknown as IAiField);
    const totalCount = records.length;
    await this.prisma.aiGenerationTask.update({
      where: { id: taskId },
      data: { status: 'processing', totalCount, startedTime: new Date() },
    });
    if (totalCount === 0) {
      await this.prisma.aiGenerationTask.update({
        where: { id: taskId },
        data: { status: 'done', finishedTime: new Date() },
      });
      return;
    }

    const mode = task.trigger as 'fill-empty' | 'entire-column';
    const sourceFieldIds = parseSourceFieldIds(aiFieldRow.sourceFieldIds);
    const targetFieldId = aiFieldRow.fieldId;
    const isImageOp = aiFieldRow.operation === 'image';
    let completed = 0;
    let failed = 0;
    let lastError: string | null = null;

    for (const record of records) {
      // Check cancellation
      const current = await this.prisma.aiGenerationTask.findUnique({
        where: { id: taskId },
        select: { cancelRequested: true, status: true },
      });
      if (current?.cancelRequested || current?.status === 'cancelled') {
        break;
      }

      try {
        const targetHasValue = record.fields[targetFieldId] !== undefined && record.fields[targetFieldId] !== null && record.fields[targetFieldId] !== '';
        if (mode === 'fill-empty' && targetHasValue) {
          // Skip — cell already has a value
        } else {
          const inputText = sourceFieldIds
            .map((fid) => this.valueToText(record.fields[fid]))
            .filter((v) => v.length > 0)
            .join('\n');
          if (inputText) {
            const run = await this.executeRun({
              aiFieldId: aiFieldRow.id,
              recordId: record.id,
              inputText,
              force: mode === 'entire-column',
              rowFields: record.fields,
            });
            if (run.status === 'ok' && this.recordModifyService) {
              const fieldValue = isImageOp
                ? this.parseAttachmentOutput(run.outputText)
                : run.outputText;
              if (fieldValue !== null) {
                await this.recordModifyService.simpleUpdateRecords(targetTable.id, {
                  fieldKeyType: FieldKeyType.Id,
                  typecast: false,
                  records: [{ id: record.id, fields: { [targetFieldId]: fieldValue } }],
                });
              }
              completed += 1;
            } else {
              failed += 1;
              lastError = run.errorMessage ?? `run status: ${run.status}`;
            }
          }
        }
      } catch (error) {
        failed += 1;
        lastError = error instanceof Error ? error.message : String(error);
      }

      // Update progress periodically (every 5 records)
      if ((completed + failed) % 5 === 0) {
        await this.prisma.aiGenerationTask.update({
          where: { id: taskId },
          data: { completedCount: completed, failedCount: failed, lastError },
        });
      }
    }

    // Final update
    const finalStatus = await this.prisma.aiGenerationTask.findUnique({
      where: { id: taskId },
      select: { cancelRequested: true },
    });
    await this.prisma.aiGenerationTask.update({
      where: { id: taskId },
      data: {
        status: finalStatus?.cancelRequested ? 'cancelled' : failed > 0 && completed === 0 ? 'failed' : 'done',
        completedCount: completed,
        failedCount: failed,
        lastError,
        errorCode: failed > 0 && completed === 0 ? 'BATCH_FAILED' : undefined,
        heartbeatAt: new Date(),
        leaseUntil: null,
        finishedTime: new Date(),
      },
    });
    } finally {
      clearInterval(heartbeatTimer);
    }
  }

  private async heartbeatBatchTask(taskId: string): Promise<void> {
    await this.prisma.aiGenerationTask.updateMany({
      where: { id: taskId, status: 'processing', cancelRequested: false },
      data: {
        heartbeatAt: new Date(),
        leaseUntil: new Date(Date.now() + AI_FIELD_BATCH_LEASE_MS),
      },
    });
  }

  /** Recover batch tasks left running by a worker that crashed or was terminated.
   * Returns expired tasks to `waiting` and re-enqueues them via the supplied queue. */
  async recoverExpiredBatchTasks(queue: Queue<{ taskId: string }>): Promise<number> {
    const now = new Date();
    const recovered = await this.prisma.aiGenerationTask.updateMany({
      where: { status: 'processing', leaseUntil: { lt: now }, cancelRequested: false },
      data: { status: 'waiting', leaseUntil: null, heartbeatAt: null, retryAt: now },
    });
    if (recovered.count === 0) return 0;
    const rows = await this.prisma.aiGenerationTask.findMany({
      where: { status: 'waiting', retryAt: now },
      select: { id: true },
    });
    if (rows.length > 0) {
      await queue.addBulk(
        rows.map((row) => ({
          name: AI_FIELD_BATCH_JOB,
          data: { taskId: row.id },
          opts: { jobId: `${row.id}:recovery` },
        }))
      );
    }
    return recovered.count;
  }

  private async markTaskFailed(taskId: string, error: string): Promise<void> {
    await this.prisma.aiGenerationTask.update({
      where: { id: taskId },
      data: {
        status: 'failed',
        lastError: error,
        errorCode: 'BATCH_TASK_FAILED',
        heartbeatAt: new Date(),
        leaseUntil: null,
        finishedTime: new Date(),
      },
    });
  }

  /** Fetch records for batch processing. Uses RecordService when available, else falls back to Prisma. */
  private async fetchBatchRecords(
    table: { id: string; baseId: string },
    aiField: IAiField
  ): Promise<Array<{ id: string; fields: Record<string, unknown> }>> {
    if (this.recordService) {
      const sourceFieldIds = parseSourceFieldIds(aiField.sourceFieldIds);
      const projection = [aiField.fieldId, ...sourceFieldIds];
      const result = await this.recordService.getRecordsFields(table.id, {
        fieldKeyType: FieldKeyType.Id,
        projection,
        take: 1000,
      });
      return result as Array<{ id: string; fields: Record<string, unknown> }>;
    }
    // Fallback: no RecordService, return empty (batch disabled)
    this.logger.warn('RecordService not available; batch generation disabled');
    return [];
  }

  /** Get batch task status. */
  async getBatchTask(taskId: string): Promise<IAiGenerationTaskRow | null> {
    const row = await this.prisma.aiGenerationTask.findUnique({ where: { id: taskId } });
    if (!row) return null;
    return this.toBatchTaskRow(row);
  }

  private toBatchTaskRow(row: {
    id: string;
    spaceId: string | null;
    baseId: string;
    tableId: string;
    trigger: string;
    status: string;
    totalCount: number;
    completedCount: number;
    failedCount: number;
    cancelRequested: boolean;
    lastError: string | null;
    errorCode: string | null;
    attempt: number;
    maxAttempts: number;
    heartbeatAt: Date | null;
    leaseUntil: Date | null;
    retryAt: Date | null;
    tenantId: string | null;
    correlationId: string | null;
    idempotencyKey: string | null;
    startedTime: Date | null;
    finishedTime: Date | null;
    createdTime: Date;
    updatedTime: Date;
  }): IAiGenerationTaskRow {
    return {
      id: row.id,
      spaceId: row.spaceId,
      baseId: row.baseId,
      tableId: row.tableId,
      trigger: row.trigger,
      status: row.status as BatchTaskStatus,
      totalCount: row.totalCount,
      completedCount: row.completedCount,
      failedCount: row.failedCount,
      cancelRequested: row.cancelRequested,
      lastError: row.lastError,
      errorCode: row.errorCode,
      attempt: row.attempt ?? 0,
      maxAttempts: row.maxAttempts ?? 1,
      heartbeatAt: row.heartbeatAt,
      leaseUntil: row.leaseUntil,
      retryAt: row.retryAt,
      tenantId: row.tenantId,
      correlationId: row.correlationId,
      idempotencyKey: row.idempotencyKey,
      startedTime: row.startedTime,
      finishedTime: row.finishedTime,
      createdTime: row.createdTime,
      updatedTime: row.updatedTime,
    };
  }

  /** Cancel a batch task. */
  async cancelBatchTask(taskId: string): Promise<IAiGenerationTaskRow | null> {
    const result = await this.prisma.aiGenerationTask.updateMany({
      where: { id: taskId, status: { in: ['waiting', 'processing'] } },
      data: {
        cancelRequested: true,
        status: 'cancelled',
        finishedTime: new Date(),
        heartbeatAt: new Date(),
        leaseUntil: null,
        errorCode: 'TASK_CANCELED',
      },
    });
    if (result.count === 0) {
      const existing = await this.prisma.aiGenerationTask.findUnique({ where: { id: taskId } });
      if (!existing) return null;
      return this.toBatchTaskRow(existing);
    }
    return this.getBatchTask(taskId);
  }

  /** List batch tasks for an AI field. */
  async listBatchTasks(aiFieldId: string, take = 20): Promise<IAiGenerationTaskRow[]> {
    const aiField = await this.prisma.aiField.findUnique({ where: { id: aiFieldId } });
    if (!aiField) return [];
    const rows = await this.prisma.aiGenerationTask.findMany({
      where: { baseId: aiField.baseId, tableId: aiField.tableId },
      orderBy: { createdTime: 'desc' },
      take,
    });
    return rows.map((row) => this.toBatchTaskRow(row));
  }

  /**
   * Resolve `{{fieldName}}` placeholders in a custom prompt template against
   * a row's fields. Unknown placeholders resolve to empty string; non-string
   * values are JSON-stringified so nested objects don't crash the prompt.
   */
  private renderCustomPrompt(
    template: string,
    fields: Record<string, unknown>
  ): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, rawKey: string) => {
      const key = rawKey.trim();
      const value = key in fields ? fields[key] : '';
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    });
  }

  private valueToText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  /**
   * Execute an enabled AI field. `stubOutput` remains supported for dry runs
   * and deterministic tests, while the default path resolves the configured
   * model and calls the real AI SDK provider.
   */
  async executeRun(input: IRunAiFieldInput): Promise<IAiFieldRun> {
    const runKey = `${input.aiFieldId}:${input.recordId}:${input.inputText}`;
    if (input.force) return this.runWithConcurrency(() => this.executeRunOnce(input));
    const inFlight = this.inFlightRuns.get(runKey);
    if (inFlight) return inFlight;
    const run = this.runWithConcurrency(() => this.executeRunDeduplicated(input));
    this.inFlightRuns.set(runKey, run);
    try {
      return await run;
    } finally {
      this.inFlightRuns.delete(runKey);
    }
  }

  private async executeRunDeduplicated(input: IRunAiFieldInput): Promise<IAiFieldRun> {
    const existing = await this.prisma.aiFieldRun.findFirst({
      where: {
        aiFieldId: input.aiFieldId,
        recordId: input.recordId,
        inputText: input.inputText,
        status: 'ok',
      },
      orderBy: { finishedAt: 'desc' },
    });
    if (existing) return toRunRow(existing);
    return this.executeRunOnce(input);
  }

  private async executeRunOnce(input: IRunAiFieldInput): Promise<IAiFieldRun> {
    const aiField = await this.prisma.aiField.findUnique({ where: { id: input.aiFieldId } });
    if (!aiField) throw new NotFoundException(`ai field not found: ${input.aiFieldId}`);
    if (aiField.status !== 'enabled') {
      return this.recordRun({
        ...input,
        status: 'skipped',
        errorMessage: `ai field is ${aiField.status}`,
      });
    }

    if (input.stubOutput !== undefined) {
      return this.recordRun({ ...input, status: 'ok' });
    }
    if (!this.ai) {
      return this.recordRun({
        ...input,
        status: 'failed',
        errorMessage: 'AI provider is not configured',
      });
    }

    const startedAt = new Date();
    try {
      const config = parseConfig<AiFieldConfig>(aiField.configJson);
      const language = 'language' in config && typeof config.language === 'string'
        ? config.language
        : 'english';
      const prompt = buildDefaultPrompt(
        aiField.operation as AiFieldOperation,
        language,
        config,
        input.inputText
      );
      const useGateway =
        aiField.model === 'MiniMax-M3' ||
        aiField.model === 'MiniMax-Text-01' ||
        aiField.model.includes('/');
      const modelKey = useGateway
        ? `aiGateway@${aiField.model}@teable`
        : `openai@${aiField.model}@teable`;

      if (aiField.operation === 'image') {
        return await this.executeImageRun(aiField as unknown as IAiField, input, modelKey, prompt, startedAt);
      }

      if (aiField.operation === 'custom') {
        const configC = parseConfig<ICustomPromptConfig>(aiField.configJson);
        const resolvedPrompt = this.renderCustomPrompt(
          configC.prompt,
          input.rowFields ?? { input: input.inputText }
        );
        const systemPrompt = configC.systemPrompt;
        const text = await this.generateWithRetry(aiField.baseId, {
          modelKey,
          prompt: systemPrompt ? `${systemPrompt}\n\n${resolvedPrompt}` : resolvedPrompt,
          task: Task.Coding,
        });
        return this.recordRun({
          ...input,
          status: 'ok',
          startedAt,
          outputText: text.trim(),
          promptTokens: estimateTokens(resolvedPrompt),
          completionTokens: estimateTokens(text),
        });
      }

      const text = await this.generateWithRetry(aiField.baseId, {
        modelKey,
        prompt,
        task: Task.Coding,
      });
      const outputText = guardOutput({
        operation: aiField.operation as AiFieldOperation,
        config,
        rawOutput: text,
      });
      return this.recordRun({
        ...input,
        status: 'ok',
        startedAt,
        outputText,
        promptTokens: estimateTokens(prompt),
        completionTokens: estimateTokens(outputText),
      });
    } catch (error) {
      return this.recordRun({
        ...input,
        status: this.isRateLimitedError(error) ? 'rate-limited' : 'failed',
        startedAt,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async executeImageRun(
    aiField: IAiField,
    input: IRunAiFieldInput,
    modelKey: string,
    prompt: string,
    startedAt: Date
  ): Promise<IAiFieldRun> {
    if (!this.ai) {
      return this.recordRun({
        ...input,
        status: 'failed',
        startedAt,
        errorMessage: 'AI provider is not configured',
      });
    }
    if (!this.attachmentsService) {
      return this.recordRun({
        ...input,
        status: 'failed',
        startedAt,
        errorMessage: 'Attachments service is not configured',
      });
    }
    const config = parseConfig<IImageConfig>(aiField.configJson);
    const result = await this.ai.generateImage(aiField.baseId, modelKey, prompt, {
      size: config.size,
      aspectRatio: config.aspectRatio,
      n: config.count ?? 1,
    });
    const items = [];
    for (const image of result.images) {
      const buffer = Buffer.from(image.uint8Array);
      const ext = image.mediaType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
      const item = await this.attachmentsService.uploadFromStream(
        Readable.from(buffer),
        {
          filename: `ai-field-${aiField.id.slice(-8)}-${Date.now().toString(36)}.${ext}`,
          contentType: image.mediaType || 'image/png',
          contentLength: buffer.length,
        }
      );
      items.push(item);
    }
    const outputText = JSON.stringify(items);
    return this.recordRun({
      ...input,
      status: 'ok',
      startedAt,
      outputText,
      promptTokens: estimateTokens(prompt),
      completionTokens: 0,
    });
  }

  private async generateWithRetry(
    baseId: string,
    input: Parameters<AiService['generateText']>[1]
  ): Promise<string> {
    if (!this.ai) throw new Error('AI provider is not configured');
    const retryAttempts = this.readPositiveInt('AI_FIELD_RETRY_ATTEMPTS', 2);
    const retryBaseMs = this.readNonNegativeInt('AI_FIELD_RETRY_BASE_MS', 250);
    let attempt = 0;
    while (true) {
      try {
        return await this.ai.generateText(baseId, input);
      } catch (error) {
        if (!this.isRetryableError(error) || attempt >= retryAttempts) throw error;
        const delayMs = retryBaseMs * 2 ** attempt;
        attempt += 1;
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  private async runWithConcurrency<T>(task: () => Promise<T>): Promise<T> {
    const maxConcurrency = this.readPositiveInt('AI_FIELD_MAX_CONCURRENCY', 2);
    while (this.activeRuns >= maxConcurrency) {
      await new Promise<void>((resolve) => this.runWaiters.push(resolve));
    }
    this.activeRuns += 1;
    try {
      return await task();
    } finally {
      this.activeRuns -= 1;
      this.runWaiters.shift()?.();
    }
  }

  private readPositiveInt(name: string, fallback: number): number {
    const value = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private readNonNegativeInt(name: string, fallback: number): number {
    const value = Number.parseInt(process.env[name] ?? '', 10);
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }

  private isRetryableError(error: unknown): boolean {
    const status = this.errorStatus(error);
    if (status === 429 || (status !== undefined && status >= 500)) return true;
    const message = error instanceof Error ? error.message : String(error);
    return /429|rate.?limit|timeout|timed out|ETIMEDOUT|ECONNRESET|5\d\d/.test(message);
  }

  private isRateLimitedError(error: unknown): boolean {
    const status = this.errorStatus(error);
    if (status === 429) return true;
    const message = error instanceof Error ? error.message : String(error);
    return /429|rate.?limit/.test(message);
  }

  private errorStatus(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') return undefined;
    const candidate = error as { status?: unknown; statusCode?: unknown };
    const status = candidate.status ?? candidate.statusCode;
    return typeof status === 'number' ? status : undefined;
  }

  async createAiField(input: ICreateAiFieldInput): Promise<IAiField> {
    if (!isValidOperation(input.operation)) throw new BadRequestException('invalid operation');
    if (!isValidModel(input.model)) throw new BadRequestException('invalid model');
    if (input.sourceFieldIds.length === 0) throw new BadRequestException('sourceFieldIds required');
    try {
      validateConfig(input.operation, input.config);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const dup = await this.prisma.aiField.findUnique({
      where: {
        baseId_tableId_fieldId_operation: {
          baseId: input.baseId,
          tableId: input.tableId,
          fieldId: input.fieldId,
          operation: input.operation,
        },
      },
    });
    if (dup) throw new ConflictException('ai field exists');
    const id = `aif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildAiFieldRow({ id, ...input });
    const created = await this.prisma.aiField.create({
      data: {
        id: row.id,
        baseId: row.baseId,
        tableId: row.tableId,
        fieldId: row.fieldId,
        operation: row.operation,
        model: row.model,
        sourceFieldIds: row.sourceFieldIds,
        configJson: row.configJson,
        configHash: row.configHash,
        createdBy: row.createdBy,
      },
    });
    return toAiFieldRow(created);
  }

  async updateAiField(aiFieldId: string, update: IUpdateAiFieldInput): Promise<IAiField> {
    const existing = await this.prisma.aiField.findUnique({ where: { id: aiFieldId } });
    if (!existing) throw new NotFoundException(`ai field not found: ${aiFieldId}`);
    if (update.model && !isValidModel(update.model)) throw new BadRequestException('invalid model');
    if (
      update.status &&
      !isValidStatusTransition(existing.status as AiFieldStatus, update.status)
    ) {
      throw new BadRequestException(
        `invalid status transition: ${existing.status} → ${update.status}`
      );
    }
    let configJson = existing.configJson;
    let configHash = existing.configHash;
    if (update.config) {
      try {
        validateConfig(existing.operation as AiFieldOperation, update.config);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      configJson = stringifyConfig(update.config);
      configHash = hashConfig(update.config);
    }
    const updated = await this.prisma.aiField.update({
      where: { id: aiFieldId },
      data: {
        model: update.model ?? existing.model,
        sourceFieldIds: update.sourceFieldIds
          ? update.sourceFieldIds.join(',')
          : existing.sourceFieldIds,
        configJson,
        configHash,
        status: update.status ?? existing.status,
        updatedTime: new Date(),
      },
    });
    return toAiFieldRow(updated);
  }

  async deleteAiField(aiFieldId: string): Promise<void> {
    const existing = await this.prisma.aiField.findUnique({ where: { id: aiFieldId } });
    if (!existing) throw new NotFoundException(`ai field not found: ${aiFieldId}`);
    await this.prisma.aiFieldRun.deleteMany({ where: { aiFieldId } });
    await this.prisma.aiField.delete({ where: { id: aiFieldId } });
  }

  async listAiFields(baseId: string, tableId: string): Promise<IAiField[]> {
    const rows = await this.prisma.aiField.findMany({ where: { baseId, tableId } });
    return rows.map(toAiFieldRow);
  }

  async getAiField(aiFieldId: string): Promise<IAiField | null> {
    const row = await this.prisma.aiField.findUnique({ where: { id: aiFieldId } });
    return row ? toAiFieldRow(row) : null;
  }

  async recordRun(
    input: IRunAiFieldInput & {
      status: 'ok' | 'failed' | 'rate-limited' | 'skipped';
      outputText?: string;
      promptTokens?: number;
      completionTokens?: number;
      startedAt?: Date;
      errorMessage?: string | null;
    }
  ): Promise<IAiFieldRun> {
    const aiField = await this.prisma.aiField.findUnique({ where: { id: input.aiFieldId } });
    if (!aiField) throw new NotFoundException(`ai field not found: ${input.aiFieldId}`);
    const startedAt = input.startedAt ?? new Date();
    const outputText = input.outputText ?? input.stubOutput ?? '';
    const finishedAt = new Date();
    const id = `aifr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildRunRow({
      id,
      model: aiField.model,
      outputText,
      ...input,
      startedAt,
      finishedAt,
    });
    const created = await this.prisma.aiFieldRun.create({
      data: {
        id: row.id,
        aiFieldId: row.aiFieldId,
        recordId: row.recordId,
        status: input.status,
        inputText: row.inputText,
        outputText: row.outputText,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        model: row.model,
        durationMs: row.durationMs,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        errorMessage: input.errorMessage ?? null,
      },
    });
    await this.prisma.aiField.update({
      where: { id: input.aiFieldId },
      data: {
        lastRunAt: finishedAt,
        lastErrorMessage: input.status === 'failed' ? input.errorMessage ?? null : null,
      },
    });
    return toRunRow(created);
  }

  async listRuns(aiFieldId: string, limit = 50): Promise<IAiFieldRun[]> {
    const rows = await this.prisma.aiFieldRun.findMany({
      where: { aiFieldId },
      orderBy: { startedAt: 'desc' },
      take: Math.min(limit, 5_000),
    });
    return rows.map(toRunRow);
  }

  async foldUsageFor(aiFieldId: string): Promise<IUsageAggregate> {
    const rows = await this.prisma.aiFieldRun.findMany({ where: { aiFieldId } });
    return foldRuns(
      rows.map((r) => ({
        status: r.status as 'ok' | 'failed' | 'rate-limited' | 'skipped',
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        durationMs: r.durationMs,
      }))
    );
  }

  async createTemplate(input: ICreateTemplateInput): Promise<IAiFieldTemplate> {
    if (!isValidOperation(input.operation)) throw new BadRequestException('invalid operation');
    if (input.name.trim().length === 0) throw new BadRequestException('name required');
    const dup = await this.prisma.aiFieldTemplate.findUnique({
      where: {
        operation_language_name: {
          operation: input.operation,
          language: input.language ?? 'english',
          name: input.name,
        },
      },
    });
    if (dup) throw new ConflictException('template exists');
    const id = `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const row = buildTemplateRow({ id, ...input });
    const created = await this.prisma.aiFieldTemplate.create({
      data: {
        id: row.id,
        operation: row.operation,
        language: row.language,
        name: row.name,
        promptTemplate: row.promptTemplate,
        description: row.description,
        createdBy: row.createdBy,
      },
    });
    return toTemplateRow(created);
  }

  async listTemplates(input: {
    operation: AiFieldOperation;
    language?: string;
  }): Promise<IAiFieldTemplate[]> {
    const rows = await this.prisma.aiFieldTemplate.findMany({
      where: { operation: input.operation, language: input.language ?? 'english' },
    });
    return rows.map(toTemplateRow);
  }

  async deleteTemplate(templateId: string): Promise<void> {
    await this.prisma.aiFieldTemplate.delete({ where: { id: templateId } });
  }

  renderPrompt(input: { template: string; variables: Record<string, string | number> }): string {
    return renderPrompt(input);
  }

  buildDefaultPrompt(input: {
    operation: AiFieldOperation;
    language: string;
    config: AiFieldConfig;
    input: string;
  }): string {
    return buildDefaultPrompt(input.operation, input.language, input.config, input.input);
  }

  guardOutput(input: {
    operation: AiFieldOperation;
    config: AiFieldConfig;
    rawOutput: string;
  }): string {
    return guardOutput(input);
  }

  estimateTokens(text: string): number {
    return estimateTokens(text);
  }

  hashConfig(config: AiFieldConfig): string {
    return hashConfig(config);
  }

  stringifyConfig(config: AiFieldConfig): string {
    return stringifyConfig(config);
  }

  parseConfig<TConfig = AiFieldConfig>(configJson: string): TConfig {
    return parseConfig<TConfig>(configJson);
  }

  parseSourceFieldIds(csv: string): string[] {
    return parseSourceFieldIds(csv);
  }

  foldRuns(
    records: ReadonlyArray<{
      status: 'ok' | 'failed' | 'rate-limited' | 'skipped';
      promptTokens: number;
      completionTokens: number;
      durationMs: number;
    }>
  ): IUsageAggregate {
    return foldRuns(records);
  }
}

function toAiFieldRow(r: {
  id: string;
  baseId: string;
  tableId: string;
  fieldId: string;
  operation: string;
  model: string;
  sourceFieldIds: string;
  configJson: string;
  configHash: string;
  status: string;
  lastRunAt: Date | null;
  lastErrorMessage: string | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}): IAiField {
  return {
    id: r.id,
    baseId: r.baseId,
    tableId: r.tableId,
    fieldId: r.fieldId,
    operation: r.operation as AiFieldOperation,
    model: r.model,
    sourceFieldIds: r.sourceFieldIds,
    configJson: r.configJson,
    configHash: r.configHash,
    status: r.status as AiFieldStatus,
    lastRunAt: r.lastRunAt,
    lastErrorMessage: r.lastErrorMessage,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}

function toRunRow(r: {
  id: string;
  aiFieldId: string;
  recordId: string;
  status: string;
  inputText: string;
  outputText: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  durationMs: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}): IAiFieldRun {
  return {
    id: r.id,
    aiFieldId: r.aiFieldId,
    recordId: r.recordId,
    status: r.status as IAiFieldRun['status'],
    inputText: r.inputText,
    outputText: r.outputText,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    model: r.model,
    durationMs: r.durationMs,
    errorMessage: r.errorMessage,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
  };
}

function toTemplateRow(r: {
  id: string;
  operation: string;
  language: string;
  name: string;
  promptTemplate: string;
  description: string | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}): IAiFieldTemplate {
  return {
    id: r.id,
    operation: r.operation as AiFieldOperation,
    language: r.language,
    name: r.name,
    promptTemplate: r.promptTemplate,
    description: r.description,
    createdBy: r.createdBy,
    createdTime: r.createdTime,
    updatedTime: r.updatedTime,
  };
}
