import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService, type Prisma } from '@teable/db-main-prisma';
import { nanoid } from 'nanoid';
import { ClsService } from 'nestjs-cls';
import {
  Events,
  type RecordCreateEvent,
  type RecordDeleteEvent,
  type RecordUpdateEvent,
} from '../../event-emitter/events';
import type { IClsStore } from '../../types/cls';

const actionByEvent = {
  [Events.TABLE_RECORD_CREATE]: 'record.create',
  [Events.TABLE_RECORD_UPDATE]: 'record.update',
  [Events.TABLE_RECORD_DELETE]: 'record.delete',
} as const;

@Injectable()
export class RecordAuditListener {
  private readonly logger = new Logger(RecordAuditListener.name);
  private readonly recentOperations = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @OnEvent(Events.TABLE_RECORD_CREATE, { async: true })
  async onCreate(event: RecordCreateEvent): Promise<void> {
    const records = Array.isArray(event.payload.record)
      ? event.payload.record
      : [event.payload.record];
    await this.persist(
      event,
      actionByEvent[Events.TABLE_RECORD_CREATE],
      records.map((record) => record.id)
    );
  }

  @OnEvent(Events.TABLE_RECORD_UPDATE, { async: true })
  async onUpdate(event: RecordUpdateEvent): Promise<void> {
    const records = Array.isArray(event.payload.record)
      ? event.payload.record
      : [event.payload.record];
    await this.persist(
      event,
      actionByEvent[Events.TABLE_RECORD_UPDATE],
      records.map((record) => record.id),
      {
        fields: records.map((record) => Object.keys(record.fields)),
      }
    );
  }

  @OnEvent(Events.TABLE_RECORD_DELETE, { async: true })
  async onDelete(event: RecordDeleteEvent): Promise<void> {
    const recordIds = Array.isArray(event.payload.recordId)
      ? event.payload.recordId
      : [event.payload.recordId];
    await this.persist(event, actionByEvent[Events.TABLE_RECORD_DELETE], recordIds);
  }

  @OnEvent(Events.OPERATION_RECORDS_CREATE, { async: true })
  async onOperationCreate(event: IOperationEvent): Promise<void> {
    await this.persistOperation(
      event,
      'record.create',
      event.records ?? this.recordsFromResolveData(event.resolveData)
    );
  }

  @OnEvent(Events.OPERATION_RECORDS_UPDATE, { async: true })
  async onOperationUpdate(event: IOperationEvent): Promise<void> {
    await this.persistOperation(
      event,
      'record.update',
      event.recordIds ?? this.recordIdsFromResolveData(event.resolveData)
    );
  }

  @OnEvent(Events.OPERATION_RECORDS_DELETE, { async: true })
  async onOperationDelete(event: IOperationEvent): Promise<void> {
    await this.persistOperation(
      event,
      'record.delete',
      event.records ?? event.recordIds ?? this.recordIdsFromResolveData(event.resolveData)
    );
  }

  private async persist(
    event: RecordCreateEvent | RecordUpdateEvent | RecordDeleteEvent,
    action: string,
    recordIds: string[],
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    const user = event.context.user ?? this.cls.get('user');
    const organization = this.cls.get('organization');
    await Promise.all(
      recordIds.map(async (recordId) => {
        try {
          await this.prisma.auditEvent.create({
            data: {
              id: `${event.id}-${recordId}`,
              organizationId: organization?.id,
              actorId: user?.id,
              action,
              detail: {
                resourceType: 'record',
                resourceId: recordId,
                payload: { tableId: event.payload.tableId, ...extra },
              } as Prisma.InputJsonValue,
              ipAddress: this.cls.get('origin')?.ip,
              requestId: this.cls.getId(),
            },
          });
        } catch (error) {
          this.logger.error(
            `record audit failed action=${action} recordId=${recordId}: ${(error as Error)?.message ?? error}`
          );
        }
      })
    );
  }

  private async persistOperation(
    event: IOperationEvent,
    action: string,
    recordIdsOrRecords: Array<string | { id: string }>
  ): Promise<void> {
    const recordIds = recordIdsOrRecords.map((record) =>
      typeof record === 'string' ? record : record.id
    );
    if (!recordIds.length) return;
    const operationKey = `${action}:${event.tableId ?? event.reqParams?.tableId}:${recordIds.join(',')}`;
    const now = Date.now();
    const previous = this.recentOperations.get(operationKey);
    this.recentOperations.set(operationKey, now);
    if (previous && now - previous < 2_000) return;
    const context = event.context ?? (event.reqUser ? { user: event.reqUser } : {});
    await this.persist(
      {
        id: event.operationId ?? event.id ?? this.cls.getId() ?? nanoid(),
        payload: {
          tableId: event.tableId ?? event.reqParams?.tableId,
          recordId: recordIds,
        },
        context,
      } as RecordDeleteEvent,
      action,
      recordIds
    );
  }

  private recordsFromResolveData(resolveData: unknown): Array<{ id: string }> {
    if (Array.isArray(resolveData)) {
      return resolveData.filter((record): record is { id: string } => {
        return Boolean(
          record &&
            typeof record === 'object' &&
            typeof (record as { id?: unknown }).id === 'string'
        );
      });
    }
    if (!resolveData || typeof resolveData !== 'object') return [];
    const records = (resolveData as { records?: unknown }).records;
    if (Array.isArray(records)) {
      return records.filter((record): record is { id: string } => {
        return Boolean(
          record &&
            typeof record === 'object' &&
            typeof (record as { id?: unknown }).id === 'string'
        );
      });
    }
    return typeof (resolveData as { id?: unknown }).id === 'string'
      ? [resolveData as { id: string }]
      : [];
  }

  private recordIdsFromResolveData(resolveData: unknown): string[] {
    return this.recordsFromResolveData(resolveData).map((record) => record.id);
  }
}

interface IOperationEvent {
  id?: string;
  operationId?: string;
  tableId?: string;
  recordIds?: string[];
  records?: Array<{ id: string }>;
  resolveData?: unknown;
  context?: { user?: { id: string; name: string; email: string } };
  reqUser?: { id: string; name: string; email: string };
  reqParams?: { tableId?: string; recordId?: string };
}
