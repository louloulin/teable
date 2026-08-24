import { Injectable } from '@nestjs/common';
import type { PrismaService } from '@teable/db-main-prisma';

/**
 * Filter DTO for `AuditLogService.query()`.
 *
 * All fields are optional; an empty filter returns the most-recent page of
 * every row in the table. Values map 1:1 onto Prisma `where` field names;
 * the controller validates input shape before calling.
 */
export interface IAuditLogFilter {
  actor?: string;
  action?: string;
  resourceType?: string;
  since?: Date;
  until?: Date;
  page?: number;
  pageSize?: number;
}

/**
 * Page result for `AuditLogService.query()`.
 */
export interface IAuditLogPage {
  rows: IAuditLogRow[];
  total: number;
}

/**
 * Row shape returned by `AuditLogService.query()`.
 *
 * Snake-case `audit_log` columns are mapped to camelCase for the API
 * response. `payload` is left as `unknown` — the consumer decides how to
 * render it; we don't validate or rewrite.
 */
export interface IAuditLogRow {
  id: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  payload: unknown;
  rootAction: string | null;
  operationId: string | null;
  createdAt: Date;
}

/**
 * Prisma delegate shape we depend on. Defined locally so the service does
 * not require `@teable/db-main-prisma` to expose `auditLog` in its current
 * generated client — the sibling Prisma migration can land in any order,
 * and tests use a mock that satisfies this shape.
 */
interface IAuditLogDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    skip?: number;
    take?: number;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }): Promise<IAuditLogRow[]>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
}

/**
 * Cast helper to access the `auditLog` model on `PrismaService`. Centralized
 * so when the Prisma client is regenerated with `auditLog` exposed, only
 * one spot changes.
 */
const getAuditLogDelegate = (prisma: PrismaService): IAuditLogDelegate => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as unknown as { auditLog: IAuditLogDelegate }).auditLog;
};

/**
 * Audit log read service.
 *
 * Owns the `where`/`skip`/`take` shape passed to Prisma and the column→
 * field mapping for the API response. The controller is responsible for
 * validating incoming query strings and clamping `pageSize`.
 *
 * Filter fields are bound to a fixed set of Prisma field names; arbitrary
 * keys from the query string are not accepted, which keeps the endpoint
 * safe from `where: { [req.query.foo]: req.query.bar }` reflection bugs.
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Query a page of audit log rows. Caller must have validated the
   * filter and clamped `pageSize`.
   *
   * `page` defaults to 1, `pageSize` defaults to 20. `since`/`until` are
   * applied as `createdAt.gte` / `createdAt.lte` independently — passing
   * only one is fine; passing neither is fine; passing both fine.
   */
  async query(filter: IAuditLogFilter): Promise<IAuditLogPage> {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;

    const where = this.buildWhere(filter);
    const delegate = getAuditLogDelegate(this.prisma);

    const [rows, total] = await Promise.all([
      delegate.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      delegate.count({ where }),
    ]);

    return { rows, total };
  }

  /**
   * Translate the public filter DTO into a Prisma `where` clause.
   *
   * Field names are bound explicitly to `userId` / `action` /
   * `resourceType` / `createdAt`. The controller must reject any unknown
   * filter key before reaching here.
   */
  private buildWhere(filter: IAuditLogFilter): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (filter.actor) {
      where.userId = filter.actor;
    }
    if (filter.action) {
      where.action = filter.action;
    }
    if (filter.resourceType) {
      where.resourceType = filter.resourceType;
    }
    if (filter.since || filter.until) {
      const createdAt: Record<string, Date> = {};
      if (filter.since) createdAt.gte = filter.since;
      if (filter.until) createdAt.lte = filter.until;
      where.createdAt = createdAt;
    }
    return where;
  }
}