import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@teable/db-main-prisma';
import type { Prisma } from '@teable/db-main-prisma';
import { nanoid } from 'nanoid';
import { ClsService } from 'nestjs-cls';
import { Events } from '../../event-emitter/events';
import type { IClsStore } from '../../types/cls';

interface IAuditEmitEvent {
  action: string;
  userId?: string;
  resourceId?: string;
  rootAction?: string;
  operationId?: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

@Injectable()
export class AuditLogListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @OnEvent(Events.AUDIT_LOG_EMIT, { async: true })
  async handleAuditLogEmit(event: IAuditEmitEvent): Promise<void> {
    const {
      action,
      userId,
      resourceType: _resourceType,
      resourceId,
      rootAction,
      operationId,
      params,
      ...payload
    } = event;
    const user = this.cls.get('user');
    const organization = this.cls.get('organization');
    const resourceType =
      typeof event.resourceType === 'string'
        ? event.resourceType
        : action.split('.')[0] ?? 'unknown';

    await this.prisma.auditEvent.create({
      data: {
        id: nanoid(),
        organizationId: organization?.id,
        actorId: userId ?? user?.id,
        action,
        detail: {
          resourceType,
          resourceId: resourceId ?? null,
          ...(rootAction ? { rootAction } : {}),
          ...(operationId ? { operationId } : {}),
          ...(params ? { params } : {}),
          payload,
        } as Prisma.InputJsonValue,
        ipAddress: this.cls.get('origin')?.ip,
        requestId: this.cls.getId(),
      },
    });
  }
}
