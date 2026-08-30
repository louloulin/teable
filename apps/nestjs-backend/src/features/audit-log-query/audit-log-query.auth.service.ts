import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildSqlWhere,
  evaluateQuery,
  normalizeQuery,
  validateQuery,
} from './audit-log-query.service';
import type { IAuditLogRow, IAuditQuery, IAuditQueryResult } from './audit-log-query.types';

@Injectable()
export class AuditLogQueryAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async query(
    rawQuery: Partial<IAuditQuery> & { where: IAuditQuery['where'] }
  ): Promise<IAuditQueryResult> {
    const query = normalizeQuery(rawQuery);
    validateQuery(query);
    const rows = await this.prisma.auditEvent.findMany({ orderBy: { createdTime: 'desc' } });
    return evaluateQuery(rows.map(toRow), query);
  }

  async buildSql(
    rawQuery: Partial<IAuditQuery> & { where: IAuditQuery['where'] }
  ): Promise<{ sql: string; params: unknown[] }> {
    const query = normalizeQuery(rawQuery);
    validateQuery(query);
    return buildSqlWhere(query);
  }
}

function toRow(r: {
  id: string;
  actorId: string | null;
  action: string;
  detail: unknown;
  createdTime: Date;
  ipAddress: string | null;
}): IAuditLogRow {
  const detail =
    r.detail && typeof r.detail === 'object' && !Array.isArray(r.detail)
      ? (r.detail as Record<string, unknown>)
      : {};
  return {
    id: r.id,
    actorId: r.actorId ?? '',
    actorType: typeof detail.actorType === 'string' ? detail.actorType : 'user',
    action: r.action,
    resourceType: typeof detail.resourceType === 'string' ? detail.resourceType : 'unknown',
    resourceId: typeof detail.resourceId === 'string' ? detail.resourceId : '',
    tableId: typeof detail.tableId === 'string' ? detail.tableId : undefined,
    createdTime: r.createdTime,
    ip: r.ipAddress ?? undefined,
    meta:
      typeof detail.payload === 'object' && detail.payload !== null
        ? (detail.payload as Record<string, unknown>)
        : undefined,
  };
}
