import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';

import { ConflictReplayAuthService } from './conflict-replay.auth.service';
import type { IConflictEvent, IReplayAttempt } from './conflict-replay.types';

/**
 * Round-31: Conflict replay HTTP controller.
 *
 * Exposes ConflictReplayAuthService (enqueueConflict, drainQueue) over HTTP.
 * Without this controller, the conflict_event capability is unreachable —
 * same "service exists, no surface" gap that R28/R29/R30 fixed.
 *
 * Routes (all under /api/conflict-replay):
 *   POST /events                              enqueue a conflict
 *   GET  /orgs/:orgId/queue                   list queued events
 *   GET  /orgs/:orgId/events/:id              load a single event
 *   DELETE /orgs/:orgId/events/:id            drop a single event (cleanup)
 *   POST /orgs/:orgId/drain                   drain queue, replay in order
 */
@Public()
@Controller('api/conflict-replay')
export class ConflictReplayController {
  constructor(private readonly auth: ConflictReplayAuthService) {}

  @Post('events')
  @HttpCode(200)
  async enqueueEvent(
    @Body()
    body: {
      orgId: string;
      recordId: string;
      kind: IConflictEvent['kind'];
      idempotencyKey: string;
    }
  ): Promise<IConflictEvent> {
    if (!body?.orgId || !body?.recordId || !body?.kind || !body?.idempotencyKey) {
      throw new BadRequestException('orgId, recordId, kind, idempotencyKey required');
    }
    return this.auth.enqueueConflict({
      orgId: body.orgId,
      recordId: body.recordId,
      kind: body.kind,
      idempotencyKey: body.idempotencyKey,
      now: Date.now(),
    });
  }

  @Get('orgs/:orgId/queue')
  async listQueue(
    @Param('orgId') orgId: string
  ): Promise<{ events: IConflictEvent[] }> {
    const rows = await this.auth['prisma'].conflictEvent.findMany({
      where: { orgId },
      orderBy: { offset: 'asc' },
    });
    return {
      events: rows.map((r: Record<string, unknown>) => rowToEvent(r)),
    };
  }

  @Get('orgs/:orgId/events/:id')
  async loadEvent(
    @Param('orgId') orgId: string,
    @Param('id') id: string
  ): Promise<IConflictEvent | { event: null }> {
    const row = await this.auth['prisma'].conflictEvent.findUnique({
      where: { id },
    });
    if (!row || row['orgId'] !== orgId) return { event: null };
    return rowToEvent(row as Record<string, unknown>);
  }

  @Delete('orgs/:orgId/events/:id')
  @HttpCode(200)
  async deleteEvent(
    @Param('orgId') orgId: string,
    @Param('id') id: string
  ): Promise<{ deleted: boolean }> {
    const row = await this.auth['prisma'].conflictEvent.findUnique({
      where: { id },
    });
    if (!row || row['orgId'] !== orgId) return { deleted: false };
    await this.auth['prisma'].conflictEvent.delete({ where: { id } });
    return { deleted: true };
  }

  @Post('orgs/:orgId/drain')
  @HttpCode(200)
  async drainQueue(
    @Param('orgId') orgId: string,
    @Body() body: { recordIds?: string[] }
  ): Promise<{
    remaining: IConflictEvent[];
    attempts: IReplayAttempt[];
    drainedCount: number;
  }> {
    // Replay applier: succeeds when recordId matches the (optional) allowlist
    // passed in body.recordIds. If no allowlist, every event is treated as a
    // permanent failure so we can observe the queue shape without mutating
    // production records — real replay wiring happens via internal callers.
    const allow = new Set(body?.recordIds ?? []);
    const out = await this.auth.drainQueue({
      orgId,
      applier:
        allow.size > 0
          ? (e: IConflictEvent) => allow.has(e.recordId)
          : () => false,
      now: Date.now(),
    });
    return {
      remaining: out.remaining,
      attempts: out.attempts,
      drainedCount: out.attempts.filter((a) => a.ok).length,
    };
  }
}

function rowToEvent(row: Record<string, unknown>): IConflictEvent {
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    recordId: String(row['recordId']),
    kind: String(row['kind']) as IConflictEvent['kind'],
    idempotencyKey: String(row['idempotencyKey']),
    offset: typeof row['offset'] === 'number' ? (row['offset'] as number) : 0,
    attempts: typeof row['attempts'] === 'number' ? (row['attempts'] as number) : 0,
    lastError:
      row['lastError'] === null || row['lastError'] === undefined
        ? undefined
        : String(row['lastError']),
    enqueuedAt: new Date(
      String(row['enqueuedAt'] ?? Date.now())
    ).toISOString(),
    lastAttemptAt:
      row['lastAttemptAt'] === null || row['lastAttemptAt'] === undefined
        ? undefined
        : new Date(String(row['lastAttemptAt'])).toISOString(),
  };
}
