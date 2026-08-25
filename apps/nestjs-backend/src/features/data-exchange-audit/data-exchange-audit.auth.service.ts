/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Data exchange audit trail — NestJS auth service (Stage 89).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  appendEvent,
  lastHash,
  queryEvents,
  validateEvent,
  verifyChain,
} from './data-exchange-audit.service';
import type {
  AuditAction,
  IAuditEvent,
  IAuditQuery,
} from './data-exchange-audit.types';
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
      where: { orgId: input.orgId },
      orderBy: { occurredAt: 'desc' },
    });
    const prevHash = anchor?.chainHash ?? '';
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
        orgId: input.orgId,
        actor: input.actor,
        action: input.action,
        recordId: input.recordId,
        metadata: input.metadata as object,
        occurredAt: input.now,
        chainHash,
      },
    });
    return event;
  }

  /** Query stored events. */
  async query(orgId: string, query: IAuditQuery): Promise<IAuditEvent[]> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { orgId },
      orderBy: { occurredAt: 'asc' },
    });
    const events = rows.map(rowToEvent);
    return queryEvents({ events, query: { ...query, orgId } });
  }

  /** Verify integrity of stored chain. */
  async verifyIntegrity(orgId: string): Promise<{ ok: boolean; brokenAt?: number }> {
    const rows = await this.prisma.auditEvent.findMany({
      where: { orgId },
      orderBy: { occurredAt: 'asc' },
    });
    return verifyChain(rows.map(rowToEvent));
  }

  /** Re-export for tests. */
  appendEvent = appendEvent;
  lastHash = lastHash;
}

function rowToEvent(r: Record<string, unknown>): IAuditEvent {
  const occurredAtRaw = r['occurredAt'];
  const occurredAt =
    typeof occurredAtRaw === 'string' ? occurredAtRaw : new Date(occurredAtRaw as string).toISOString();
  return {
    id: String(r['id']),
    orgId: String(r['orgId']),
    actor: String(r['actor']),
    action: String(r['action']) as AuditAction,
    recordId: r['recordId'] ? String(r['recordId']) : undefined,
    metadata: (r['metadata'] as Record<string, unknown>) ?? {},
    occurredAt,
    chainHash: String(r['chainHash']),
  };
}
