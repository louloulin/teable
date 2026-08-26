/**
 * Database-view — thin-DI wrapper helpers (Stage 130).
 *
 * Pure formatters for query clauses and result summaries. No Nest DI.
 */

import type { IQueryClause, IViewResultSummary } from './database-view.types';

/** Render a clause as a single-line SQL fragment. */
export function formatQueryClause(clause: IQueryClause): string {
  return `${clause.kind.toUpperCase()} ${clause.sql}`.trim();
}

/** Compute a small summary from a result-set shape. */
export function summarizeViewResult(rows: ReadonlyArray<Record<string, unknown>>): IViewResultSummary {
  if (rows.length === 0) {
    return { total: 0, distinct: 0, truncated: false };
  }
  const firstCol = Object.keys(rows[0] ?? {})[0] ?? '';
  const seen = new Set<string>();
  for (const r of rows) {
    const v = firstCol ? r[firstCol] : undefined;
    if (v !== undefined) seen.add(String(v));
  }
  return {
    total: rows.length,
    distinct: seen.size,
    truncated: rows.length >= 1000,
  };
}