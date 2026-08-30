import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { exportAuditEvents } from '../audit-export/audit-export.service';
import type {
  AuditExportFormat,
  IAuditEventRow,
  IAuditExportResult,
} from '../audit-export/audit-export.types';

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
 * The persisted `audit_event` detail document is mapped to the legacy audit
 * log response shape expected by the admin API.
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
 * The response retains the original admin audit-log contract while reading
 * from the durable `auditEvent` model.
 */
interface IAuditEventRecord {
  id: string;
  organizationId: string | null;
  actorId: string | null;
  action: string;
  detail: unknown;
  ipAddress: string | null;
  requestId: string | null;
  createdTime: Date;
}

interface IAuditEventDelegate {
  findMany(args: {
    where: Record<string, unknown>;
    skip?: number;
    take?: number;
    orderBy?: Record<string, 'asc' | 'desc'>;
  }): Promise<IAuditEventRecord[]>;
  count(args: { where: Record<string, unknown> }): Promise<number>;
}

const getAuditEventDelegate = (prisma: PrismaService): IAuditEventDelegate => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as unknown as { auditEvent: IAuditEventDelegate }).auditEvent;
};

const asDetail = (detail: unknown): Record<string, unknown> =>
  detail && typeof detail === 'object' && !Array.isArray(detail)
    ? (detail as Record<string, unknown>)
    : {};

const toAuditLogRow = (record: IAuditEventRecord): IAuditLogRow => {
  const detail = asDetail(record.detail);
  const resourceType = typeof detail.resourceType === 'string' ? detail.resourceType : 'unknown';
  const resourceId = typeof detail.resourceId === 'string' ? detail.resourceId : null;
  const rootAction = typeof detail.rootAction === 'string' ? detail.rootAction : null;
  const operationId = typeof detail.operationId === 'string' ? detail.operationId : null;

  return {
    id: record.id,
    userId: record.actorId ?? '',
    action: record.action,
    resourceType,
    resourceId,
    payload: detail.payload ?? detail,
    rootAction,
    operationId,
    createdAt: record.createdTime,
  };
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
    const delegate = getAuditEventDelegate(this.prisma);

    const [records, total] = await Promise.all([
      delegate.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdTime: 'desc' },
      }),
      delegate.count({ where }),
    ]);

    return { rows: records.map(toAuditLogRow), total };
  }

  /**
   * Materialize a bounded export using the same validated filters as the
   * paginated endpoint. Exports are intentionally capped so an admin request
   * cannot turn into an unbounded database read or response body.
   */
  async export(filter: IAuditLogFilter, format: AuditExportFormat): Promise<IAuditExportResult> {
    const where = this.buildWhere(filter);
    const delegate = getAuditEventDelegate(this.prisma);
    const records = await delegate.findMany({
      where,
      take: 50_000,
      orderBy: { createdTime: 'desc' },
    });
    const events: IAuditEventRow[] = records.map((record) => ({
      id: record.id,
      organizationId: record.organizationId,
      actorId: record.actorId,
      action: record.action,
      detail: record.detail,
      ipAddress: record.ipAddress,
      requestId: record.requestId,
      createdTime: record.createdTime,
    }));
    return exportAuditEvents({ events, format });
  }

  /**
   * Translate the public filter DTO into a Prisma `where` clause.
   *
   * Field names are bound explicitly to `actorId` / `action` / `createdTime`.
   * `resourceType` is stored in the JSON detail document and is therefore
   * filtered after the database query only when requested.
   * The controller must reject any unknown
   * filter key before reaching here.
   */
  private buildWhere(filter: IAuditLogFilter): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (filter.actor) {
      where.actorId = filter.actor;
    }
    if (filter.action) {
      where.action = filter.action;
    }
    if (filter.resourceType) {
      where.detail = { path: ['resourceType'], equals: filter.resourceType };
    }
    if (filter.since || filter.until) {
      const createdTime: Record<string, Date> = {};
      if (filter.since) createdTime.gte = filter.since;
      if (filter.until) createdTime.lte = filter.until;
      where.createdTime = createdTime;
    }
    return where;
  }
}
