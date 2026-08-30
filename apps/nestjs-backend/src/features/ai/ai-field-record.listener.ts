/**
 * AI field record listener — Round 11 T-11.
 *
 * Hooks `TABLE_RECORD_CREATE` and computes the value for any field whose
 * `aiConfig` requests it. The actual record-create hot path is untouched —
 * this listener fires asynchronously after the original record is persisted,
 * computes the AI output via the existing `AiService.generateText`, and
 * writes the result back through `RecordModifyService.simpleUpdateRecords`.
 *
 * Hard constraints honored:
 *   - Zero new npm dependencies.
 *   - No edits to `record-create.service` / `record-update.service`.
 *   - AI service is not rewritten; we only call its public `generateText`.
 *   - Module wiring stays minimal (one-line provider add in `app.module.ts`).
 */
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { getRandomString, type IFieldAIConfig, type IRecord, type TableDomain } from '@teable/core';
import { FieldKeyType } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import { Events } from '../../event-emitter/events';
import {
  RecordCreateEvent,
  RecordUpdateEvent,
} from '../../event-emitter/events/table/record.event';
import type { IFieldInstance } from '../field/model/factory';
import { RecordModifyService } from '../record/record-modify/record-modify.service';
import { TableDomainQueryService } from '../table-domain';
import { buildAiFieldPrompt, collectAiFieldSourceIds } from './ai-field-prompt.builder';
import { AiService } from './ai.service';

interface IRecordWithId extends IRecord {
  id: string;
  fields: Record<string, unknown>;
}

interface IRowResult {
  recordId: string;
  fields: Record<string, unknown>;
}

interface IUpdateChange {
  id: string;
  fields: Record<string, { oldValue?: unknown; newValue?: unknown }>;
}

const asRecord = (value: unknown): IRecordWithId | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<IRecordWithId>;
  if (typeof candidate.id !== 'string') return null;
  const fields = (candidate.fields ?? {}) as Record<string, unknown>;
  return { id: candidate.id, fields };
};

const flattenUpdatedFields = (
  recordList: IUpdateChange | IUpdateChange[] | undefined,
  recordId: string
): Record<string, unknown> => {
  if (!recordList) return {};
  const list = Array.isArray(recordList) ? recordList : [recordList];
  const target = list.find((r) => r?.id === recordId);
  if (!target) return {};
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(target.fields ?? {})) {
    flat[k] = v?.newValue ?? v;
  }
  return flat;
};

@Injectable()
export class AiFieldRecordListener {
  private readonly logger = new Logger(AiFieldRecordListener.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly aiService: AiService,
    private readonly recordModifyService: RecordModifyService,
    private readonly tableDomainQueryService: TableDomainQueryService
  ) {}

  @OnEvent(Events.TABLE_RECORD_CREATE, { async: true })
  async onRecordCreate(event: RecordCreateEvent): Promise<void> {
    const raw = event.payload.record;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const records = list.map((r) => asRecord(r)).filter((r): r is IRecordWithId => r !== null);
    if (records.length === 0) return;
    await this.computeAndPersist(event.payload.tableId, records, 'create');
  }

  @OnEvent(Events.TABLE_RECORD_UPDATE, { async: true })
  async onRecordUpdate(event: RecordUpdateEvent): Promise<void> {
    const changeList = this.parseUpdateChanges(event.payload.record);
    if (changeList.length === 0) return;

    let table: TableDomain | null = null;
    try {
      table = await this.tableDomainQueryService.getTableDomainById(event.payload.tableId);
    } catch (err) {
      this.logger.warn(
        `table lookup failed for ${event.payload.tableId}: ${(err as Error)?.message ?? err}`
      );
      return;
    }
    if (!table) return;

    const aiFields = this.collectAiFields(table.fieldList as ReadonlyArray<IFieldInstance>);
    if (aiFields.length === 0) return;

    if (!this.hasWatchedFieldChange(changeList, aiFields)) return;

    const records: IRecordWithId[] = changeList
      .map((change) => {
        const fields = flattenUpdatedFields(event.payload.record, change.id);
        return { id: change.id, fields };
      })
      .filter((r) => Object.keys(r.fields).length > 0);
    if (records.length === 0) return;

    await this.computeAndPersist(event.payload.tableId, records, 'update');
  }

  private collectAiFields(fieldList: ReadonlyArray<IFieldInstance>): IFieldInstance[] {
    return fieldList.filter((f) => {
      const cfg = f.aiConfig as IFieldAIConfig | undefined | null;
      return !!cfg && !!cfg.type;
    });
  }

  private parseUpdateChanges(raw: RecordUpdateEvent['payload']['record']): IUpdateChange[] {
    const items = Array.isArray(raw) ? raw : [raw];
    return items
      .filter((item) => !!item && typeof item.id === 'string')
      .map((item) => item as unknown as IUpdateChange);
  }

  private hasWatchedFieldChange(
    changes: IUpdateChange[],
    aiFields: ReadonlyArray<IFieldInstance>
  ): boolean {
    const watchedIds = new Set(
      aiFields.flatMap((field) => collectAiFieldSourceIds(field.aiConfig as IFieldAIConfig))
    );
    return changes.some((change) =>
      Object.keys(change.fields ?? {}).some((id) => watchedIds.has(id))
    );
  }

  private async computeAndPersist(
    tableId: string,
    records: IRecordWithId[],
    phase: 'create' | 'update'
  ): Promise<void> {
    if (records.length === 0) return;

    const table = await this.loadTable(tableId);
    if (!table) return;
    const aiFields = this.collectAiFields(table.fieldList as ReadonlyArray<IFieldInstance>);
    if (aiFields.length === 0) return;

    const baseId = table.baseId;
    if (!baseId) {
      this.logger.warn(`baseId missing for table ${tableId}`);
      return;
    }

    const taskId = await this.createTask({
      tableId,
      baseId,
      phase,
      totalCount: records.length * aiFields.length,
    });
    if (!taskId) return;

    const stringify = (field: IFieldInstance, raw: unknown): string => {
      try {
        return field.cellValue2String(raw);
      } catch {
        return raw == null ? '' : String(raw);
      }
    };

    const updatesByRow: Record<string, IRowResult> = {};

    for (const record of records) {
      for (const field of aiFields) {
        if (await this.isTaskCanceled(taskId)) return;
        await this.processAiField({
          taskId,
          baseId,
          tableId,
          phase,
          table,
          record,
          field,
          stringify,
          updatesByRow,
        });
      }
    }

    const rowUpdates = Object.values(updatesByRow);
    if (rowUpdates.length === 0) {
      await this.prismaService.aiGenerationTask.update({
        where: { id: taskId },
        data: { status: 'completed', finishedTime: new Date() },
      });
      return;
    }

    try {
      await this.recordModifyService.simpleUpdateRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        typecast: false,
        records: rowUpdates.map((row) => ({ id: row.recordId, fields: row.fields })),
      });
      await this.prismaService.aiGenerationTask.update({
        where: { id: taskId },
        data: { status: 'completed', finishedTime: new Date() },
      });
    } catch (err) {
      await this.prismaService.aiGenerationTask.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          finishedTime: new Date(),
          lastError: (err as Error)?.message ?? String(err),
        },
      });
      this.logger.error(
        `AI field persistence failed table=${tableId} phase=${phase}: ${(err as Error)?.message ?? err}`,
        (err as Error)?.stack
      );
    }
  }

  private async loadTable(tableId: string): Promise<TableDomain | null> {
    try {
      return await this.tableDomainQueryService.getTableDomainById(tableId);
    } catch (err) {
      this.logger.warn(`table lookup failed for ${tableId}: ${(err as Error)?.message ?? err}`);
      return null;
    }
  }

  private async createTask(input: {
    tableId: string;
    baseId: string;
    phase: 'create' | 'update';
    totalCount: number;
  }): Promise<string | null> {
    const taskId = `aigt_${getRandomString(20)}`;
    try {
      const base = await this.prismaService.base.findUnique({
        where: { id: input.baseId },
        select: { spaceId: true },
      });
      await this.prismaService.aiGenerationTask.create({
        data: {
          id: taskId,
          spaceId: base?.spaceId ?? null,
          baseId: input.baseId,
          tableId: input.tableId,
          trigger: input.phase,
          totalCount: input.totalCount,
          status: 'processing',
          startedTime: new Date(),
        },
      });
      return taskId;
    } catch (err) {
      this.logger.warn(
        `AI generation task creation failed for ${input.tableId}: ${(err as Error)?.message ?? err}`
      );
      return null;
    }
  }

  private async isTaskCanceled(taskId: string): Promise<boolean> {
    const task = await this.prismaService.aiGenerationTask.findUnique({
      where: { id: taskId },
      select: { cancelRequested: true },
    });
    if (!task?.cancelRequested) return false;
    await this.prismaService.aiGenerationTask.update({
      where: { id: taskId },
      data: { status: 'canceled', finishedTime: new Date() },
    });
    return true;
  }

  private async processAiField(input: {
    taskId: string;
    baseId: string;
    tableId: string;
    phase: 'create' | 'update';
    table: TableDomain;
    record: IRecordWithId;
    field: IFieldInstance;
    stringify: (field: IFieldInstance, raw: unknown) => string;
    updatesByRow: Record<string, IRowResult>;
  }): Promise<void> {
    const { taskId, baseId, tableId, phase, table, record, field, stringify, updatesByRow } = input;
    const cfg = field.aiConfig as IFieldAIConfig;
    const valueMap: Record<string, string> = {};
    for (const id of collectAiFieldSourceIds(cfg)) {
      const source = table.fieldList.find((candidate) => candidate.id === id) as
        | IFieldInstance
        | undefined;
      const raw = record.fields?.[id];
      if (source && raw != null) valueMap[id] = stringify(source, raw);
    }
    const prompt = buildAiFieldPrompt({ config: cfg, fieldValueById: valueMap });
    if (prompt == null) {
      await this.markTaskCompleted(taskId);
      return;
    }
    try {
      const generated = await this.aiService.generateText(
        baseId,
        { prompt, modelKey: cfg.modelKey || undefined },
        false
      );
      const text = (generated ?? '').toString().trim();
      if (text) {
        updatesByRow[record.id] ??= { recordId: record.id, fields: {} };
        updatesByRow[record.id].fields[field.id] = text;
      }
      await this.markTaskCompleted(taskId);
    } catch (err) {
      await this.prismaService.aiGenerationTask.update({
        where: { id: taskId },
        data: {
          completedCount: { increment: 1 },
          failedCount: { increment: 1 },
          lastError: (err as Error)?.message ?? String(err),
        },
      });
      this.logger.warn(
        `AI field compute failed table=${tableId} field=${field.id} record=${record.id} phase=${phase}: ${(err as Error)?.message ?? err}`
      );
    }
  }

  private markTaskCompleted(taskId: string) {
    return this.prismaService.aiGenerationTask.update({
      where: { id: taskId },
      data: { completedCount: { increment: 1 } },
    });
  }
}
