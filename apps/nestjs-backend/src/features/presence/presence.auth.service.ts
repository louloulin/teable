import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyJoinPolicy,
  computeExpiresAt,
  deriveStatusOnTick,
  filterByQuery,
  isValidStatus,
  liveSessions,
  validateCursor,
  validateJoinInput,
  validateQueryInput,
  validateTickInput,
  validateUpdateStatusInput,
} from './presence.service';
import type {
  ICursorState,
  IJoinPresenceInput,
  IPresenceSession,
  IPresenceQueryInput,
  ITickInput,
  IUpdateCursorInput,
  IUpdateStatusInput,
  PresenceScope,
  PresenceStatus,
} from './presence.types';

@Injectable()
export class PresenceAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async join(input: IJoinPresenceInput, now: Date = new Date()): Promise<IPresenceSession> {
    validateJoinInput(input);
    const existing = await this.prisma.presenceSession.findMany({
      where: { baseId: input.baseId },
    });
    const drop = applyJoinPolicy(existing, input);
    if (drop.length > 0) {
      await this.prisma.presenceSession.deleteMany({
        where: { id: { in: drop.map((d) => d.id) } },
      });
    }
    const id = `ps_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const expiresAt = computeExpiresAt(now);
    const row = await this.prisma.presenceSession.create({
      data: {
        id,
        baseId: input.baseId,
        scope: input.scope,
        scopeId: input.scopeId,
        userId: input.userId,
        color: input.color,
        displayName: input.displayName.trim(),
        status: 'active',
        lastHeartbeatAt: now,
        expiresAt,
        connectedAt: now,
      },
    });
    return toSession(row);
  }

  async leave(sessionId: string): Promise<void> {
    const existing = await this.prisma.presenceSession.findUnique({ where: { id: sessionId } });
    if (!existing) throw new NotFoundException(`session not found: ${sessionId}`);
    await this.prisma.presenceSession.delete({ where: { id: sessionId } });
  }

  async updateCursor(input: IUpdateCursorInput, now: Date = new Date()): Promise<IPresenceSession> {
    validateCursor(input);
    const existing = await this.prisma.presenceSession.findUnique({
      where: { id: input.sessionId },
    });
    if (!existing) throw new NotFoundException(`session not found: ${input.sessionId}`);
    const expiresAt = computeExpiresAt(now);
    const updated = await this.prisma.presenceSession.update({
      where: { id: input.sessionId },
      data: {
        cursorJson: JSON.stringify(input.cursor),
        lastHeartbeatAt: now,
        expiresAt,
      },
    });
    return toSession(updated);
  }

  async updateStatus(input: IUpdateStatusInput, now: Date = new Date()): Promise<IPresenceSession> {
    validateUpdateStatusInput(input);
    const existing = await this.prisma.presenceSession.findUnique({
      where: { id: input.sessionId },
    });
    if (!existing) throw new NotFoundException(`session not found: ${input.sessionId}`);
    const expiresAt = computeExpiresAt(now);
    const updated = await this.prisma.presenceSession.update({
      where: { id: input.sessionId },
      data: {
        status: input.status,
        lastHeartbeatAt: now,
        expiresAt,
      },
    });
    return toSession(updated);
  }

  async tick(input: ITickInput, now: Date = new Date()): Promise<IPresenceSession> {
    validateTickInput(input);
    const existing = await this.prisma.presenceSession.findUnique({
      where: { id: input.sessionId },
    });
    if (!existing) throw new NotFoundException(`session not found: ${input.sessionId}`);
    const session = toSession(existing);
    const derived = deriveStatusOnTick(session, now);
    const status: PresenceStatus = input.status ?? derived;
    const expiresAt = computeExpiresAt(now);
    const updated = await this.prisma.presenceSession.update({
      where: { id: input.sessionId },
      data: {
        status,
        lastHeartbeatAt: now,
        expiresAt,
      },
    });
    return toSession(updated);
  }

  async getSession(sessionId: string): Promise<IPresenceSession> {
    const row = await this.prisma.presenceSession.findUnique({ where: { id: sessionId } });
    if (!row) throw new NotFoundException(`session not found: ${sessionId}`);
    return toSession(row);
  }

  async listForBase(
    input: IPresenceQueryInput,
    now: Date = new Date()
  ): Promise<IPresenceSession[]> {
    validateQueryInput(input);
    const where: Record<string, unknown> = { baseId: input.baseId };
    if (input.scope) where['scope'] = input.scope;
    if (input.scopeId) where['scopeId'] = input.scopeId;
    const rows = await this.prisma.presenceSession.findMany({ where });
    const sessions = rows.map(toSession);
    return liveSessions(filterByQuery(sessions, input), now);
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.presenceSession.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return result.count;
  }

  isValidStatus = isValidStatus;
  filterByQuery = filterByQuery;
  liveSessions = liveSessions;
}

function toSession(r: {
  id: string;
  baseId: string;
  scope: string;
  scopeId: string;
  userId: string;
  color: string;
  displayName: string;
  status: string;
  cursorJson: string | null;
  lastHeartbeatAt: Date;
  expiresAt: Date;
  connectedAt: Date;
}): IPresenceSession {
  const cursor: ICursorState | undefined = r.cursorJson
    ? (JSON.parse(r.cursorJson) as ICursorState)
    : undefined;
  return {
    id: r.id,
    baseId: r.baseId,
    scope: r.scope as PresenceScope,
    scopeId: r.scopeId,
    userId: r.userId,
    color: r.color,
    displayName: r.displayName,
    status: r.status as PresenceStatus,
    cursor,
    lastHeartbeatAt: r.lastHeartbeatAt,
    expiresAt: r.expiresAt,
    connectedAt: r.connectedAt,
  };
}
