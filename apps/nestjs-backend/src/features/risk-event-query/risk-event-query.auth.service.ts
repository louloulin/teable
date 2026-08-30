/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Risk event query DSL — NestJS auth service (Stage 79).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildQuery,
  cursorWhere,
  nextCursor,
  orderBy,
  paginate,
  toWhere,
} from './risk-event-query.service';
import type {
  IRiskEventCursor,
  IRiskEventFilter,
  IRiskEventQuery,
  IRiskEventRow,
  RiskBandKind,
  RiskDecisionKind,
  RiskEventKind,
} from './risk-event-query.types';

@Injectable()
export class RiskEventQueryAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a filter and emit a query envelope. */
  buildQuery(input: { filter: IRiskEventFilter }): IRiskEventQuery {
    return buildQuery(input);
  }

  /** Compile to a Prisma `where`. */
  toWhere(filter: IRiskEventFilter): Record<string, unknown> {
    return toWhere(filter);
  }

  /** Compute the orderBy clause. */
  orderBy(filter: IRiskEventFilter): Array<Record<string, 'asc' | 'desc'>> {
    return orderBy(filter);
  }

  /** Compute cursor predicate. */
  cursorWhere(input: {
    filter: IRiskEventFilter;
    cursor: IRiskEventCursor;
  }): Record<string, unknown> {
    return cursorWhere(input);
  }

  /** Compute next cursor. */
  nextCursor(input: { last: IRiskEventRow | null }): IRiskEventCursor | null {
    return nextCursor(input);
  }

  /** Execute the query against persisted risk decisions. */
  async searchDecisions(input: { filter: IRiskEventFilter }): Promise<{
    rows: IRiskEventRow[];
    nextCursor: IRiskEventCursor | null;
  }> {
    const q = buildQuery(input);
    const where = toWhere(q.filter);
    const ord = orderBy(q.filter);
    const cursorPred = q.filter.cursor
      ? cursorWhere({ filter: q.filter, cursor: q.filter.cursor })
      : null;
    const fullWhere = cursorPred ? { AND: [where, cursorPred] } : where;
    const rows = await this.prisma.riskDecision.findMany({
      where: fullWhere as never,
      orderBy: ord as never,
      take: q.filter.limit ?? 50,
    });
    const mapped = rows.map((r) => this.rowFromDecision(r));
    return { rows: mapped, nextCursor: nextCursor({ last: mapped[mapped.length - 1] ?? null }) };
  }

  /** Execute against login attempts. */
  async searchLoginAttempts(input: { filter: IRiskEventFilter }): Promise<{
    rows: IRiskEventRow[];
    nextCursor: IRiskEventCursor | null;
  }> {
    const q = buildQuery(input);
    const where = toWhere(q.filter);
    const ord = orderBy(q.filter);
    const cursorPred = q.filter.cursor
      ? cursorWhere({ filter: q.filter, cursor: q.filter.cursor })
      : null;
    const fullWhere = cursorPred ? { AND: [where, cursorPred] } : where;
    const rows = await this.prisma.loginAttempt.findMany({
      where: fullWhere as never,
      orderBy: ord as never,
      take: q.filter.limit ?? 50,
    });
    const mapped = rows.map((r) => this.rowFromLogin(r));
    return { rows: mapped, nextCursor: nextCursor({ last: mapped[mapped.length - 1] ?? null }) };
  }

  /** Run an in-memory paginate over already-loaded rows. */
  paginateInMemory(input: { rows: IRiskEventRow[]; filter: IRiskEventFilter }): {
    rows: IRiskEventRow[];
    nextCursor: IRiskEventCursor | null;
  } {
    return paginate(input);
  }

  /** Map a Prisma decision row to the unified event row. */
  private rowFromDecision(r: Record<string, unknown>): IRiskEventRow {
    return {
      id: String(r['id']),
      orgId: String(r['orgId']),
      actorId: String(r['actorId']),
      kind: 'risk-decision',
      decision: (r['action'] as RiskDecisionKind) ?? null,
      band: (r['band'] as RiskBandKind) ?? null,
      detail: String(r['detail'] ?? ''),
      occurredAt: new Date(String(r['createdAt'])).toISOString(),
    };
  }

  /** Map a Prisma login-attempt row. */
  private rowFromLogin(r: Record<string, unknown>): IRiskEventRow {
    return {
      id: String(r['id']),
      orgId: String(r['orgId']),
      actorId: String(r['actorId']),
      kind: 'login-attempt',
      decision: (r['outcome'] as RiskDecisionKind) ?? null,
      band: (r['band'] as RiskBandKind) ?? null,
      detail: String(r['failureReason'] ?? r['userAgent'] ?? ''),
      occurredAt: new Date(String(r['occurredAt'])).toISOString(),
    };
  }

  /** Map a ban-audit row. */
  rowFromBanAudit(r: Record<string, unknown>): IRiskEventRow {
    return {
      id: String(r['id']),
      orgId: String(r['orgId']),
      actorId: String(r['actorId']),
      kind: 'ban-action',
      decision: null,
      band: null,
      detail: `${String(r['action'])}:${String(r['detail'] ?? '')}`,
      occurredAt: new Date(String(r['occurredAt'])).toISOString(),
    };
  }

  /** Re-export event-kind predicate. */
  isRiskEventKind = (s: string): s is RiskEventKind => {
    return ['risk-decision', 'login-attempt', 'ban-action'].includes(s);
  };
}
