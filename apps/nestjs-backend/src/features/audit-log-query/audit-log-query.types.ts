/**
 * Audit-log query DSL — Stage 52.
 *
 * A small structured query language for the audit log. Translates to
 * both (a) an in-memory predicate for tests / fixtures and (b) a
 * parameterized SQL `WHERE` clause over the audit log table.
 *
 * The grammar is intentionally small:
 *
 *   query      := clause (AND clause)*
 *   clause     := field op value
 *              |  field IN [value, ...]
 *              |  field BETWEEN value AND value
 *              |  NOT clause
 *              |  ( query )
 *   field      := actorId | actorType | action | resourceType
 *              |  resourceId | tableId | createdTime | ip
 *   op         := = | != | ~ | startsWith | endsWith | contains
 *   value      := string | number | ISO-8601 timestamp
 */

export type AuditField =
  | 'actorId'
  | 'actorType'
  | 'action'
  | 'resourceType'
  | 'resourceId'
  | 'tableId'
  | 'createdTime'
  | 'ip';

export type AuditOp =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'between'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export type AuditValue = string | number;

export interface IAuditClause {
  field: AuditField;
  op: AuditOp;
  value: AuditValue | ReadonlyArray<AuditValue>;
}

export interface IAuditNot {
  not: IAuditNode;
}

export interface IAuditAnd {
  and: ReadonlyArray<IAuditNode>;
}

export type IAuditNode = IAuditClause | IAuditNot | IAuditAnd;

export interface IAuditSort {
  field: AuditField;
  direction: 'asc' | 'desc';
}

export interface IAuditQuery {
  where: IAuditNode;
  sort?: IAuditSort;
  limit?: number;
  offset?: number;
}

export interface IAuditLogRow {
  id: string;
  actorId: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  tableId?: string;
  createdTime: Date;
  ip?: string;
  /** Optional payload for context. */
  meta?: Record<string, unknown>;
}

export interface IAuditQueryResult {
  rows: ReadonlyArray<IAuditLogRow>;
  total: number;
  query: IAuditQuery;
  elapsedMs: number;
}

export const DEFAULT_AUDIT_LIMIT = 50;
export const MAX_AUDIT_LIMIT = 500;
export const AUDIT_FIELDS: ReadonlyArray<AuditField> = [
  'actorId',
  'actorType',
  'action',
  'resourceType',
  'resourceId',
  'tableId',
  'createdTime',
  'ip',
];
