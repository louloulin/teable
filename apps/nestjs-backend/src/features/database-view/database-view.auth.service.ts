/**
 * Database-view — thin-DI wrapper (Stage 130).
 *
 * Auth-layer façade over the database-view service. The heavy lifting
 * stays in the existing service; this class is a thin delegating wrapper
 * used by callers that want Nest DI.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { formatQueryClause, summarizeViewResult } from './database-view.helpers';
import type { IQueryClause, IViewQueryValidation, IViewResultSummary } from './database-view.types';

@Injectable()
export class DatabaseViewAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate that the referenced view exists and is not soft-deleted.
   * Pure delegate over Prisma's view row lookup.
   */
  async validateViewQuery(viewId: string): Promise<IViewQueryValidation> {
    const row = await this.prisma.view.findFirst({
      where: { id: viewId, deletedTime: null },
      select: { id: true, filter: true, order: true, group: true },
    });
    if (!row) {
      return { valid: false, reason: 'view-not-found', clauses: [] };
    }
    const clauses: IQueryClause[] = [];
    if (row.filter) clauses.push({ kind: 'where', sql: row.filter });
    if (row.order) clauses.push({ kind: 'order', sql: row.order });
    if (row.group) clauses.push({ kind: 'group', sql: row.group });
    return { valid: true, clauses };
  }

  /** Format a single clause (delegated). */
  format(clause: IQueryClause): string {
    return formatQueryClause(clause);
  }

  /** Summarise a result set (delegated). */
  summarize(rows: ReadonlyArray<Record<string, unknown>>): IViewResultSummary {
    return summarizeViewResult(rows);
  }
}