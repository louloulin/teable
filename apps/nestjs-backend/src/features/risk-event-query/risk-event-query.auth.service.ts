/* SPDX-License-Identifier: AGPL-3.0-or-later */
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

type RiskWhere = Record<string, unknown>;

function inClause(values: ReadonlyArray<string> | undefined): { in: ReadonlyArray<string> } | undefined {
  return values && values.length > 0 ? { in: values } : undefined;
}

function timeClause(from: string | undefined, to: string | undefined): RiskWhere | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lt: to } : {}),
  };
}

/** RiskDecision uses `action` and `createdAt`; the public DSL uses neutral names. */
function decisionWhere(filter: IRiskEventFilter): RiskWhere {
  return {
    ...(inClause(filter.orgIds) ? { orgId: inClause(filter.orgIds) } : {}),
    ...(inClause(filter.actorIds) ? { actorId: inClause(filter.actorIds) } : {}),
    ...(inClause(filter.decisions) ? { action: inClause(filter.decisions) } : {}),
    ...(inClause(filter.bands) ? { band: inClause(filter.bands) } : {}),
    ...(timeClause(filter.from, filter.to) ? { createdAt: timeClause(filter.from, filter.to) } : {}),
    ...(filter.text ? { detail: { contains: filter.text, mode: 'insensitive' } } : {}),
  };
}

/** LoginAttempt uses `outcome` and `occurredAt`; map the same public DSL accordingly. */
function loginAttemptWhere(filter: IRiskEventFilter): RiskWhere {
  const outcomes = filter.decisions?.map((decision) => loginOutcomeForDecision(decision));
  return {
    ...(inClause(filter.orgIds) ? { orgId: inClause(filter.orgIds) } : {}),
    ...(inClause(filter.actorIds) ? { actorId: inClause(filter.actorIds) } : {}),
    ...(inClause(outcomes) ? { outcome: inClause(outcomes) } : {}),
    ...(inClause(filter.bands) ? { band: inClause(filter.bands) } : {}),
    ...(timeClause(filter.from, filter.to) ? { occurredAt: timeClause(filter.from, filter.to) } : {}),
    ...(filter.text
      ? {
          OR: [
            { failureReason: { contains: filter.text, mode: 'insensitive' } },
            { userAgent: { contains: filter.text, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
}

function loginOutcomeForDecision(
  decision: RiskDecisionKind
): 'success' | 'mfa-challenge' | 'soft-blocked' | 'hard-blocked' {
  switch (decision) {
    case 'allow':
      return 'success';
    case 'challenge':
      return 'mfa-challenge';
    case 'soft-block':
      return 'soft-blocked';
    case 'hard-block':
      return 'hard-blocked';
  }
}

function decisionOrderBy(filter: IRiskEventFilter): Array<Record<string, 'asc' | 'desc'>> {
  const direction = filter.order ?? 'desc';
  return [{ createdAt: direction }, { id: direction }];
}

function loginAttemptOrderBy(filter: IRiskEventFilter): Array<Record<string, 'asc' | 'desc'>> {
  const direction = filter.order ?? 'desc';
  return [{ occurredAt: direction }, { id: direction }];
}

function decisionCursorWhere(input: {
  filter: IRiskEventFilter;
  cursor: IRiskEventCursor;
}): RiskWhere {
  const operator = (input.filter.order ?? 'desc') === 'desc' ? 'lt' : 'gt';
  return {
    OR: [
      { createdAt: { [operator]: input.cursor.key } },
      { createdAt: input.cursor.key, id: { [operator]: input.cursor.id } },
    ],
  };
}

function loginAttemptCursorWhere(input: {
  filter: IRiskEventFilter;
  cursor: IRiskEventCursor;
}): RiskWhere {
  const operator = (input.filter.order ?? 'desc') === 'desc' ? 'lt' : 'gt';
  return {
    OR: [
      { occurredAt: { [operator]: input.cursor.key } },
      { occurredAt: input.cursor.key, id: { [operator]: input.cursor.id } },
    ],
  };
}

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
    if (q.filter.kinds && !q.filter.kinds.includes('risk-decision')) {
      return { rows: [], nextCursor: null };
    }
    const where = decisionWhere(q.filter);
    const ord = decisionOrderBy(q.filter);
    const cursorPred = q.filter.cursor
      ? decisionCursorWhere({ filter: q.filter, cursor: q.filter.cursor })
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
    if (q.filter.kinds && !q.filter.kinds.includes('login-attempt')) {
      return { rows: [], nextCursor: null };
    }
    const where = loginAttemptWhere(q.filter);
    const ord = loginAttemptOrderBy(q.filter);
    const cursorPred = q.filter.cursor
      ? loginAttemptCursorWhere({ filter: q.filter, cursor: q.filter.cursor })
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

  /** Count persisted risk decisions matching a filter. */
  async countDecisions(input: { filter: IRiskEventFilter }): Promise<number> {
    const q = buildQuery(input);
    if (q.filter.kinds && !q.filter.kinds.includes('risk-decision')) return 0;
    return this.prisma.riskDecision.count({ where: decisionWhere(q.filter) as never });
  }

  /** Count persisted login attempts matching a filter. */
  async countLoginAttempts(input: { filter: IRiskEventFilter }): Promise<number> {
    const q = buildQuery(input);
    if (q.filter.kinds && !q.filter.kinds.includes('login-attempt')) return 0;
    return this.prisma.loginAttempt.count({ where: loginAttemptWhere(q.filter) as never });
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
      decision: loginDecisionForOutcome(String(r['outcome'] ?? '')),
      band: (r['band'] as RiskBandKind) ?? null,
      detail: String(r['failureReason'] ?? r['userAgent'] ?? ''),
      occurredAt: new Date(String(r['occurredAt'])).toISOString(),
    };
  }

  private loginDecisionForOutcome(outcome: string): RiskDecisionKind | null {
    return loginDecisionForOutcome(outcome);
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

function loginDecisionForOutcome(outcome: string): RiskDecisionKind | null {
  switch (outcome) {
    case 'success':
      return 'allow';
    case 'mfa-challenge':
      return 'challenge';
    case 'soft-blocked':
      return 'soft-block';
    case 'hard-blocked':
      return 'hard-block';
    default:
      return null;
  }
}
