/**
 * DbDurationInterceptor — Wave 12 observability.
 *
 * Records `db_query_duration_seconds` from a Prisma `$on('query')`
 * event listener. The actual listener wiring lives in `prisma-query-listener.ts`
 * — this file is the pure-shape counterpart that other services can
 * consume to time individual queries.
 *
 * Two integration modes are supported:
 *
 *   1. **Event-listener mode (preferred)**: attach the listener returned
 *      by `createPrismaQueryListener()` to a PrismaClient via
 *      `client.$on('query', listener)`. The listener times the query
 *      using the duration reported by Prisma (`e.duration`).
 *
 *   2. **Manual mode**: any service-level wrapper can call
 *      `recordDbQuery(operation, table, outcome, durationMs)` directly
 *      with a stopwatch — useful for raw queries / custom adapters.
 *
 * The file deliberately does NOT inject PrismaService: T-12-01 owns the
 * SDK init, and at that point the listener is wired onto both the meta
 * and data PrismaService instances. This module is just the receiver.
 */

import { Logger } from '@nestjs/common';

import { recordDbQuery } from './metric-recorder';

/**
 * Shape of a Prisma `$on('query')` event. Defined locally so we don't
 * import `@prisma/client` here — keeps this file cheap to type-check.
 */
export interface IPrismaQueryEvent {
  /** The query template, e.g. `SELECT * FROM "user" WHERE "id" = $1`. */
  query: string;
  /** Bound parameters. */
  params: string;
  /** Duration reported by Prisma, in milliseconds. */
  duration: number;
  /** Target table — sometimes missing on raw queries. */
  target?: string;
}

/**
 * Build a `$on('query')` listener that records query duration.
 *
 * The `operation` is derived from the leading verb of the SQL query
 * (SELECT/INSERT/UPDATE/DELETE/etc.) since the Prisma `query` event
 * doesn't carry the action verb directly. For raw queries Prisma does
 * not set `target`, so the table falls back to the first table token in
 * the SQL, or 'unknown' as a last resort.
 *
 * Outcome is always recorded as 'success' from this listener; failures
 * surface via Prisma's `$on('error')` channel which is handled outside
 * this module.
 */
export function createPrismaQueryListener(): (event: IPrismaQueryEvent) => void {
  const logger = new Logger('PrismaQueryListener');
  return (event) => {
    try {
      const operation = parseOperation(event.query, event.target);
      const table = parseTable(event.query, event.target);
      const outcome = 'success';
      const durationMs = Number.isFinite(event.duration) ? event.duration : 0;
      recordDbQuery(operation, table, outcome, durationMs);
    } catch (err) {
      logger.debug(`db metrics: failed to record query event (${(err as Error).message})`);
    }
  };
}

/**
 * Build a `$on('error')` listener that records the duration of a failed
 * query. Prisma's error event carries `duration` in ms but no query
 * text — best-effort: we still record the duration with outcome='failed'
 * and operation='other' so error rates are observable.
 */
export function createPrismaErrorListener(): (event: { duration: number }) => void {
  const logger = new Logger('PrismaErrorListener');
  return (event) => {
    try {
      const durationMs = Number.isFinite(event.duration) ? event.duration : 0;
      recordDbQuery('other', 'unknown', 'failed', durationMs);
    } catch (err) {
      logger.debug(`db metrics: failed to record error event (${(err as Error).message})`);
    }
  };
}

/**
 * Best-effort operation extraction from a SQL string. Returns the
 * canonical Prisma operation label (e.g. 'findFirst', 'create').
 *
 * Most application-side Prisma queries are issued as raw SQL of the
 * form `SELECT ... FROM ...`. We map that back to a coarse operation
 * bucket so the time-series are comparable across services.
 */
export function parseOperation(query: string, target?: string): string {
  if (!query) return 'other';
  const head = query.trim().split(/\s+/)[0]?.toUpperCase();
  switch (head) {
    case 'SELECT':
      // Prisma's findMany/findFirst/findUnique/count/aggregate all
      // surface as SELECT; we keep the verb coarse.
      return target ? 'findMany' : 'queryRaw';
    case 'INSERT':
      return 'createMany';
    case 'UPDATE':
      return 'updateMany';
    case 'DELETE':
      return 'deleteMany';
    case 'BEGIN':
    case 'COMMIT':
    case 'ROLLBACK':
      return 'transaction';
    default:
      return target ? 'other' : 'executeRaw';
  }
}

/**
 * Best-effort table extraction. Prefer the Prisma-reported target; fall
 * back to the first quoted identifier (`"user"`, `public.user`, etc.).
 */
export function parseTable(query: string, target?: string): string {
  if (target) return target;
  if (!query) return 'unknown';
  // Match first "name" / "schema"."name" / table-name token
  const quoted = query.match(/"([\w]+)"/);
  if (quoted && quoted[1]) return quoted[1];
  const unquoted = query.match(/\bFROM\s+([\w]+)/i);
  if (unquoted && unquoted[1]) return unquoted[1];
  return 'unknown';
}

/**
 * @deprecated — replaced by `recordDbQuery` in metric-recorder.ts.
 * Re-exported here as a thin alias so existing call sites that import
 * from this module continue to work without modification.
 */
export const recordDbQueryMetric = recordDbQuery;