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
    const rows = await this.prisma.auditLog.findMany({ orderBy: { createdTime: 'desc' } });
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
  actorId: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string;
  tableId: string | null;
  createdTime: Date;
  ip: string | null;
}): IAuditLogRow {
  return {
    id: r.id,
    actorId: r.actorId,
    actorType: r.actorType,
    action: r.action,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    tableId: r.tableId ?? undefined,
    createdTime: r.createdTime,
    ip: r.ip ?? undefined,
  };
}
