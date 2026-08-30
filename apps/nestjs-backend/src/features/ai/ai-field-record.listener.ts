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
import type { IFieldAIConfig, IRecord, TableDomain } from '@teable/core';
import { FieldKeyType } from '@teable/core';
import type { IFieldInstance } from '../field/model/factory';
import { RecordModifyService } from '../record/record-modify/record-modify.service';
import { TableDomainQueryService } from '../table-domain';
import { Events } from '../../event-emitter/events';
import type { RecordCreateEvent, RecordUpdateEvent } from '../../event-emitter/events';
import { AiService } from './ai.service';
import { buildAiFieldPrompt, collectAiFieldSourceIds } from './ai-field-prompt.builder';

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
    const changeList: IUpdateChange[] = [];
    const raw = event.payload.record;
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (item && typeof item.id === 'string') {
          changeList.push(item as IUpdateChange);
        }
      }
    } else if (raw && typeof raw.id === 'string') {
      changeList.push(raw as IUpdateChange);
    }
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

    const watchedIds = new Set<string>();
    for (const field of aiFields) {
      for (const id of collectAiFieldSourceIds(field.aiConfig as IFieldAIConfig)) {
        watchedIds.add(id);
      }
    }
    const dirty = changeList.some((change) =>
      Object.keys(change.fields ?? {}).some((id) => watchedIds.has(id))
    );
    if (!dirty) return;

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

  private async computeAndPersist(
    tableId: string,
    records: IRecordWithId[],
    phase: 'create' | 'update'
  ): Promise<void> {
    if (records.length === 0) return;

    let table: TableDomain;
    try {
      table = await this.tableDomainQueryService.getTableDomainById(tableId);
    } catch (err) {
      this.logger.warn(`table lookup failed for ${tableId}: ${(err as Error)?.message ?? err}`);
      return;
    }
    const aiFields = this.collectAiFields(table.fieldList as ReadonlyArray<IFieldInstance>);
    if (aiFields.length === 0) return;

    const baseId = table.baseId;
    if (!baseId) {
      this.logger.warn(`baseId missing for table ${tableId}`);
      return;
    }

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
        const cfg = field.aiConfig as IFieldAIConfig;
        const sourceIds = collectAiFieldSourceIds(cfg);
        const valueMap: Record<string, string> = {};
        for (const id of sourceIds) {
          const src = table.fieldList.find((f) => f.id === id) as IFieldInstance | undefined;
          const raw = record.fields?.[id];
          if (!src || raw == null) continue;
          valueMap[id] = stringify(src, raw);
        }
        const prompt = buildAiFieldPrompt({ config: cfg, fieldValueById: valueMap });
        if (prompt == null) continue;

        try {
          const generated = await this.aiService.generateText(
            baseId,
            {
              prompt,
              modelKey: cfg.modelKey || undefined,
            },
            false
          );
          const text = (generated ?? '').toString().trim();
          if (!text) continue;
          if (!updatesByRow[record.id]) {
            updatesByRow[record.id] = { recordId: record.id, fields: {} };
          }
          updatesByRow[record.id].fields[field.id] = text;
        } catch (err) {
          this.logger.warn(
            `AI field compute failed table=${tableId} field=${field.id} record=${record.id} phase=${phase}: ${(err as Error)?.message ?? err}`
          );
        }
      }
    }

    const rowUpdates = Object.values(updatesByRow);
    if (rowUpdates.length === 0) return;

    try {
      await this.recordModifyService.simpleUpdateRecords(tableId, {
        fieldKeyType: FieldKeyType.Id,
        typecast: false,
        records: rowUpdates.map((row) => ({ id: row.recordId, fields: row.fields })),
      });
    } catch (err) {
      this.logger.error(
        `AI field persistence failed table=${tableId} phase=${phase}: ${(err as Error)?.message ?? err}`,
        (err as Error)?.stack
      );
    }
  }
}
