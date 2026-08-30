/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Data exchange audit trail — NestJS auth service (Stage 89).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService, type Prisma } from '@teable/db-main-prisma';

import {
  appendEvent,
  lastHash,
  queryEvents,
  validateEvent,
  verifyChain,
} from './data-exchange-audit.service';
import type { AuditAction, IAuditEvent, IAuditQuery } from './data-exchange-audit.types';
import { hashEvent } from './data-exchange-audit.types';

@Injectable()
export class DataExchangeAuditAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Record an event. */
  async record(input: {
    orgId: string;
    actor: string;
    action: AuditAction;
    recordId?: string;
    metadata: Record<string, unknown>;
    now: string;
  }): Promise<IAuditEvent> {
    const id = `${input.orgId}:${input.now}:${Math.random().toString(36).slice(2, 10)}`;
    const anchor = await this.prisma.auditEvent.findFirst({
      where: { organizationId: input.orgId },
      orderBy: { createdTime: 'desc' },
    });
    const anchorDetail = anchor?.detail;
    const prevHash =
      anchorDetail && typeof anchorDetail === 'object' && 'chainHash' in anchorDetail
        ? String(anchorDetail.chainHash)
        : '';
    const chainHash = hashEvent({
      id,
      orgId: input.orgId,
      actor: input.actor,
      action: input.action,
      recordId: input.recordId,
      metadata: input.metadata,
      occurredAt: input.now,
      prevHash,
    });
    const event: IAuditEvent = {
      id,
      orgId: input.orgId,
      actor: input.actor,
      action: input.action,
      recordId: input.recordId,
      metadata: input.metadata,
      occurredAt: input.now,
      chainHash,
    };
    const err = validateEvent(event);
    if (err) throw new Error(err);
    await this.prisma.auditEvent.create({
      data: {
        id,
        organizationId: input.orgId,
        actorId: input.actor,
        action: input.action,
        detail: {
          metadata: input.metadata,
          recordId: input.recordId ?? null,
          occurredAt: input.now,
          chainHash,
        } as Prisma.InputJsonObject,
      },
    });
    return event;
  }

  /** Query stored events. */
  async query(orgId: string, query: IAuditQuery): Promise<IAuditEvent[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { organizationId: orgId },
      orderBy: { createdTime: 'asc' },
    });
    const events = rows.map(rowToEvent);
    return queryEvents({ events, query: { ...query, orgId } });
  }

  /** Verify integrity of stored chain. */
  async verifyIntegrity(orgId: string): Promise<{ ok: boolean; brokenAt?: number }> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { organizationId: orgId },
      orderBy: { createdTime: 'asc' },
    });
    return verifyChain(rows.map(rowToEvent));
  }

  /** Re-export for tests. */
  appendEvent = appendEvent;
  lastHash = lastHash;
}

function rowToEvent(r: Record<string, unknown>): IAuditEvent {
  const detail = r['detail'];
  const detailRecord =
    detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : {};
  const occurredAtRaw = detailRecord['occurredAt'] ?? r['createdTime'];
  const occurredAt =
    typeof occurredAtRaw === 'string'
      ? occurredAtRaw
      : new Date(occurredAtRaw as string).toISOString();
  return {
    id: String(r['id']),
    orgId: String(r['organizationId']),
    actor: String(r['actorId']),
    action: String(r['action']) as AuditAction,
    recordId: detailRecord['recordId'] ? String(detailRecord['recordId']) : undefined,
    metadata: (detailRecord['metadata'] as Record<string, unknown>) ?? {},
    occurredAt,
    chainHash: String(detailRecord['chainHash'] ?? ''),
  };
}
