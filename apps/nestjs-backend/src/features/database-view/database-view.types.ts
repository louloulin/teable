/**
 * Database-view — thin-DI wrapper types (Stage 130).
 */

export type QueryClauseKind = 'where' | 'order' | 'group' | 'limit' | 'offset';

export interface IQueryClause {
  kind: QueryClauseKind;
  /** Raw SQL fragment. */
  sql: string;
}

export interface IViewQueryValidation {
  valid: boolean;
  reason?: string;
  clauses: IQueryClause[];
}

export interface IViewResultSummary {
  total: number;
  /** Distinct values in the first projected column, capped. */
  distinct: number;
  truncated: boolean;
}