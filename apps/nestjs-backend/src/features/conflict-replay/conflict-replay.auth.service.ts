/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Conflict replay queue — NestJS auth service (Stage 87).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  canRetry,
  drain,
  enqueue,
  validateEvent,
} from './conflict-replay.service';
import type {
  IConflictEvent,
  IReplayAttempt,
} from './conflict-replay.types';

@Injectable()
export class ConflictReplayAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Enqueue a conflict event, deduping by idempotency key. */
  async enqueueConflict(input: {
    orgId: string;
    recordId: string;
    kind: IConflictEvent['kind'];
    idempotencyKey: string;
    now: number;
  }): Promise<IConflictEvent> {
    const last = await this.prisma.conflictEvent.findFirst({
      where: { orgId: input.orgId },
      orderBy: { offset: 'desc' },
    });
    const offset = (last?.offset ?? -1) + 1;
    const event: IConflictEvent = {
      id: `${input.orgId}:${input.idempotencyKey}:${offset}`,
      orgId: input.orgId,
      recordId: input.recordId,
      kind: input.kind,
      idempotencyKey: input.idempotencyKey,
      offset,
      attempts: 0,
      enqueuedAt: new Date(input.now).toISOString(),
    };
    const err = validateEvent(event);
    if (err) throw new Error(err);
    await this.persistEvent(event);
    return event;
  }

  /** Drain the queue. */
  async drainQueue(input: {
    orgId: string;
    applier: (e: IConflictEvent) => boolean;
    now: number;
  }): Promise<{ remaining: IConflictEvent[]; attempts: IReplayAttempt[] }> {
    const rows = await this.prisma.conflictEvent.findMany({
      where: { orgId: input.orgId },
      orderBy: { offset: 'asc' },
    });
    const events = rows.map(rowToEvent);
    const out = drain({ events, applier: input.applier, now: input.now });
    await this.persistRemaining(input.orgId, out.remaining);
    return out;
  }

  /** Whether the event is still retryable. */
  canRetry = canRetry;
  enqueue = enqueue;

  private async persistEvent(e: IConflictEvent): Promise<void> {
    await this.prisma.conflictEvent.upsert({
      where: { id: e.id },
      create: {
        id: e.id,
        orgId: e.orgId,
        recordId: e.recordId,
        kind: e.kind,
        idempotencyKey: e.idempotencyKey,
        offset: e.offset,
        attempts: e.attempts,
        lastError: e.lastError,
        enqueuedAt: new Date(e.enqueuedAt),
        lastAttemptAt: e.lastAttemptAt ? new Date(e.lastAttemptAt) : null,
      },
      update: {
        attempts: e.attempts,
        lastError: e.lastError,
        lastAttemptAt: e.lastAttemptAt ? new Date(e.lastAttemptAt) : null,
      },
    });
  }

  private async persistRemaining(orgId: string, remaining: IConflictEvent[]): Promise<void> {
    const existing = await this.prisma.conflictEvent.findMany({ where: { orgId } });
    const keepIds = new Set(remaining.map((e) => e.id));
    for (const row of existing) {
      if (!keepIds.has(row.id)) {
        await this.prisma.conflictEvent.delete({ where: { id: row.id } });
      }
    }
    for (const e of remaining) {
      await this.persistEvent(e);
    }
  }
}

function rowToEvent(r: Record<string, unknown>): IConflictEvent {
  return {
    id: String(r['id']),
    orgId: String(r['orgId']),
    recordId: String(r['recordId']),
    kind: String(r['kind']) as IConflictEvent['kind'],
    idempotencyKey: String(r['idempotencyKey']),
    offset: Number(r['offset']),
    attempts: Number(r['attempts']),
    lastError: r['lastError'] ? String(r['lastError']) : undefined,
    enqueuedAt: new Date(r['enqueuedAt'] as string).toISOString(),
    lastAttemptAt: r['lastAttemptAt']
      ? new Date(r['lastAttemptAt'] as string).toISOString()
      : undefined,
  };
}
