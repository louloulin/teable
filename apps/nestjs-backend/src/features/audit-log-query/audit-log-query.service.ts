/**
 * Audit-log query DSL — Stage 52.
 *
 * Pure helpers: validation, AST normalization, in-memory evaluation
 * (for tests), and SQL emission with parameterized binds. The auth
 * service feeds actual Prisma rows into `evaluateQuery` and uses
 * `buildSql` to translate the DSL into a real `WHERE`.
 */

import type {
  AuditField,
  AuditOp,
  AuditValue,
  IAuditAnd,
  IAuditClause,
  IAuditLogRow,
  IAuditNode,
  IAuditNot,
  IAuditQuery,
  IAuditQueryResult,
  IAuditSort,
} from './audit-log-query.types';
import { AUDIT_FIELDS, DEFAULT_AUDIT_LIMIT, MAX_AUDIT_LIMIT } from './audit-log-query.types';

const FIELD_SET = new Set<string>(AUDIT_FIELDS);

export function isAuditField(s: string): s is AuditField {
  return FIELD_SET.has(s);
}

export function isAuditOp(s: string): s is AuditOp {
  return (
    s === 'eq' ||
    s === 'neq' ||
    s === 'contains' ||
    s === 'startsWith' ||
    s === 'endsWith' ||
    s === 'in' ||
    s === 'between' ||
    s === 'gt' ||
    s === 'gte' ||
    s === 'lt' ||
    s === 'lte'
  );
}

/** Walk an AST node, yielding every leaf clause. */
export function walkClauses(node: IAuditNode, out: IAuditClause[] = []): IAuditClause[] {
  if ('and' in node) {
    for (const c of node.and) walkClauses(c, out);
  } else if ('not' in node) {
    walkClauses(node.not, out);
  } else {
    out.push(node);
  }
  return out;
}

/** Validate a query AST. Throws on bad fields / ops / values. */
export function validateQuery(q: IAuditQuery): void {
  if (!q || !q.where) throw new Error('where required');
  validateNode(q.where);
  if (q.limit !== undefined && (q.limit < 1 || q.limit > MAX_AUDIT_LIMIT)) {
    throw new Error(`limit out of range (1-${MAX_AUDIT_LIMIT})`);
  }
  if (q.offset !== undefined && q.offset < 0) throw new Error('offset must be >= 0');
  if (q.sort) validateSort(q.sort);
}

function validateSort(s: IAuditSort): void {
  if (!isAuditField(s.field)) throw new Error(`invalid sort field: ${s.field}`);
  if (s.direction !== 'asc' && s.direction !== 'desc') {
    throw new Error(`invalid direction: ${s.direction}`);
  }
}

function validateNode(n: IAuditNode | undefined): void {
  if (!n) throw new Error('empty node');
  if ('and' in n) {
    if (!Array.isArray(n.and) || n.and.length === 0) throw new Error('and requires children');
    for (const c of n.and) validateNode(c);
  } else if ('not' in n) {
    validateNode(n.not);
  } else if ('field' in n) {
    validateClause(n);
  } else {
    throw new Error('unknown node shape');
  }
}

function validateClause(c: IAuditClause): void {
  if (!isAuditField(c.field)) throw new Error(`invalid field: ${c.field}`);
  if (!isAuditOp(c.op)) throw new Error(`invalid op: ${c.op}`);
  if (c.op === 'in') return validateInClause(c);
  if (c.op === 'between') return validateBetweenClause(c);
  validateScalarClause(c);
}

function validateInClause(c: IAuditClause): void {
  if (!Array.isArray(c.value) || c.value.length === 0) {
    throw new Error('in requires non-empty array');
  }
  for (const v of c.value) validateValue(c.field, v);
}

function validateBetweenClause(c: IAuditClause): void {
  if (!Array.isArray(c.value) || c.value.length !== 2) {
    throw new Error('between requires [start, end]');
  }
  for (const v of c.value) validateValue(c.field, v);
}

function validateScalarClause(c: IAuditClause): void {
  if (Array.isArray(c.value)) throw new Error(`op ${c.op} does not accept array`);
  validateValue(c.field, c.value);
}

function validateValue(field: AuditField, v: unknown): asserts v is AuditValue {
  if (typeof v !== 'string' && typeof v !== 'number') {
    throw new Error(`value for ${field} must be string or number`);
  }
  if (field === 'createdTime' && typeof v === 'string' && Number.isNaN(Date.parse(v))) {
    throw new Error(`invalid timestamp: ${v}`);
  }
}

/** Build a single-clause IN-list helper for shorthand. */
export function clauseIn(field: AuditField, values: ReadonlyArray<AuditValue>): IAuditClause {
  return { field, op: 'in', value: [...values] };
}

/** Build an `AND` node. Empty children become an empty `and` (rejected by validator). */
export function andOf(...children: IAuditNode[]): IAuditAnd {
  return { and: children };
}

/** Build a `NOT` node. */
export function notOf(child: IAuditNode): IAuditNot {
  return { not: child };
}

/** Resolve a field value from a row (handles ISO timestamp coercion). */
export function getFieldValue(row: IAuditLogRow, field: AuditField): AuditValue | undefined {
  const raw = (row as unknown as Record<string, unknown>)[field];
  if (field === 'createdTime' && raw instanceof Date) {
    return raw.toISOString();
  }
  if (typeof raw === 'string' || typeof raw === 'number') return raw;
  return undefined;
}

/** Apply one clause to one row. */
export function matchesClause(row: IAuditLogRow, c: IAuditClause): boolean {
  const v = getFieldValue(row, c.field);
  if (c.op === 'in') {
    return Array.isArray(c.value) && c.value.includes(v as AuditValue);
  }
  if (c.op === 'between') {
    if (!Array.isArray(c.value) || c.value.length !== 2) return false;
    const [start, end] = c.value as ReadonlyArray<AuditValue>;
    if (v === undefined) return false;
    return compareValues(v, start) >= 0 && compareValues(v, end) <= 0;
  }
  if (v === undefined) return false;
  switch (c.op) {
    case 'eq':
      return v === c.value;
    case 'neq':
      return v !== c.value;
    case 'gt':
      return compareValues(v, c.value as AuditValue) > 0;
    case 'gte':
      return compareValues(v, c.value as AuditValue) >= 0;
    case 'lt':
      return compareValues(v, c.value as AuditValue) < 0;
    case 'lte':
      return compareValues(v, c.value as AuditValue) <= 0;
    case 'contains':
      return typeof v === 'string' && typeof c.value === 'string' && v.includes(c.value);
    case 'startsWith':
      return typeof v === 'string' && typeof c.value === 'string' && v.startsWith(c.value);
    case 'endsWith':
      return typeof v === 'string' && typeof c.value === 'string' && v.endsWith(c.value);
    default:
      return false;
  }
}

function compareValues(a: AuditValue, b: AuditValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/** Recursively evaluate a node against a row. */
export function matchesNode(row: IAuditLogRow, n: IAuditNode): boolean {
  if ('and' in n) return n.and.every((c) => matchesNode(row, c));
  if ('not' in n) return !matchesNode(row, n.not);
  return matchesClause(row, n);
}

/** Evaluate a query over a list of rows. */
export function evaluateQuery(
  rows: ReadonlyArray<IAuditLogRow>,
  q: IAuditQuery
): IAuditQueryResult {
  const startedAt = Date.now();
  const matched = rows.filter((r) => matchesNode(r, q.where));
  const sorted = q.sort ? sortRows(matched, q.sort) : matched;
  const total = sorted.length;
  const offset = q.offset ?? 0;
  const limit = q.limit ?? DEFAULT_AUDIT_LIMIT;
  const page = sorted.slice(offset, offset + limit);
  return {
    rows: page,
    total,
    query: q,
    elapsedMs: Date.now() - startedAt,
  };
}

function sortRows(rows: ReadonlyArray<IAuditLogRow>, s: IAuditSort): IAuditLogRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    const av = getFieldValue(a, s.field);
    const bv = getFieldValue(b, s.field);
    const cmp = compareValues(av as AuditValue, bv as AuditValue);
    return s.direction === 'asc' ? cmp : -cmp;
  });
  return out;
}

/** Build a parameterized SQL `WHERE` from the query AST. */
export function buildSqlWhere(q: IAuditQuery): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const { sql } = compileNode(q.where, params);
  return { sql: sql === '' ? 'TRUE' : sql, params };
}

function compileNode(n: IAuditNode, params: unknown[]): { sql: string } {
  if ('and' in n) {
    const parts = n.and.map((c) => compileNode(c, params).sql).filter((s) => s.length > 0);
    return { sql: parts.length === 0 ? '' : parts.join(' AND ') };
  }
  if ('not' in n) {
    const inner = compileNode(n.not, params).sql;
    if (inner.length === 0) return { sql: '' };
    return { sql: `(NOT ${inner})` };
  }
  return compileClause(n, params);
}

function compileClause(c: IAuditClause, params: unknown[]): { sql: string } {
  const col = quoteCol(c.field);
  if (c.op === 'in') {
    const arr = c.value as ReadonlyArray<AuditValue>;
    const placeholders = arr.map((v) => pushParam(params, v)).join(', ');
    return { sql: `${col} IN (${placeholders})` };
  }
  if (c.op === 'between') {
    const [start, end] = c.value as ReadonlyArray<AuditValue>;
    return {
      sql: `${col} BETWEEN ${pushParam(params, start)} AND ${pushParam(params, end)}`,
    };
  }
  if (c.op === 'contains') {
    return { sql: `${col} ILIKE ${pushParam(params, `%${c.value}%`)}` };
  }
  if (c.op === 'startsWith') {
    return { sql: `${col} ILIKE ${pushParam(params, `${c.value}%`)}` };
  }
  if (c.op === 'endsWith') {
    return { sql: `${col} ILIKE ${pushParam(params, `%${c.value}`)}` };
  }
  const ops: Record<string, string> = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
  };
  const sqlOp = ops[c.op];
  if (!sqlOp) return { sql: '' };
  return { sql: `${col} ${sqlOp} ${pushParam(params, c.value as AuditValue)}` };
}

function pushParam(params: unknown[], v: AuditValue): string {
  params.push(v);
  return `$${params.length}`;
}

function quoteCol(field: AuditField): string {
  // PascalCase or camelCase → snake_case for SQL.
  return `"${field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)}"`;
}

/** Normalize a partial query, filling defaults. */
export function normalizeQuery(q: Partial<IAuditQuery> & { where: IAuditNode }): IAuditQuery {
  return {
    where: q.where,
    sort: q.sort,
    limit: q.limit ?? DEFAULT_AUDIT_LIMIT,
    offset: q.offset ?? 0,
  };
}
