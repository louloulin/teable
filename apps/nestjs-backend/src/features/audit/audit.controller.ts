/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Audit admin controller — exposes the read-only audit-log surface
 * (`AuditAuthService.listAuditOperations`) over HTTP for the admin UI.
 *
 *  - GET /api/admin/audit/operations        → list operations (filter + limit)
 *  - GET /api/admin/audit/operations/summary → same call without the row
 *                                              payload, returning the count
 *                                              and a small per-action rollup
 *                                              so the UI banner can show
 *                                              "123 ops, 47 http_request"
 *
 * All routes go through `LicenseCapabilityGuard.for('audit_log')` so only
 * Business / Enterprise plan users (or self-host ops with the capability
 * unlocked) can read audit rows. Audit rows include caller identifiers and
 * arbitrary payload metadata — keeping them admin-only avoids leaking PII.
 *
 * No write paths are exposed: the controller never mutates the audit log.
 * All writes continue to flow through `AuditScope.emitAtomic` and the global
 * `AuditInterceptor`, which is unchanged by this commit.
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import {
  listAuditOperationsQuerySchema,
  type IListAuditOperationsQuery,
} from './audit.query.schema';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AuditAuthService } from './audit.auth.service';

const AuditAdminGuard = LicenseCapabilityGuard.for('audit_log');

@Controller('api/admin/audit/operations')
@UseGuards(AuditAdminGuard)
export class AuditAdminController {
  constructor(private readonly auditAuthService: AuditAuthService) {}

  /** List audit operations matching the optional filter. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(listAuditOperationsQuerySchema))
    query: IListAuditOperationsQuery
  ): Promise<{
    rows: ReturnType<typeof toRowPojo>;
    nextCursor: string | null;
    total: number;
  }> {
    const result = await this.auditAuthService.listAuditOperations({
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      limit: query.limit,
    });
    return {
      rows: result.rows.map(toRowPojo),
      nextCursor: result.nextCursor,
      total: result.rows.length,
    };
  }

  /**
   * Lightweight summary: same filter semantics, but returns the count plus a
   * per-action rollup so the admin banner can render "X total (Y distinct
   * actions)" without paying the cost of returning the full row payload.
   */
  @Get('/summary')
  async summary(
    @Query(new ZodValidationPipe(listAuditOperationsQuerySchema))
    query: IListAuditOperationsQuery
  ): Promise<{
    total: number;
    distinctActions: number;
    perAction: Array<{ action: string; count: number }>;
  }> {
    const result = await this.auditAuthService.listAuditOperations({
      ...(query.action ? { action: query.action } : {}),
      ...(query.resourceId ? { resourceId: query.resourceId } : {}),
      limit: query.limit,
    });
    const counts = new Map<string, number>();
    for (const row of result.rows) {
      counts.set(row.action, (counts.get(row.action) ?? 0) + 1);
    }
    return {
      total: result.rows.length,
      distinctActions: counts.size,
      perAction: Array.from(counts.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
    };
  }
}

/** Serialize a single audit row for the wire — Date → ISO string. */
function toRowPojo(row: {
  id: string;
  action: string;
  resourceId: string;
  userId: string | null;
  rootAction: string | null;
  operationId: string | null;
  createdAt: Date;
}): {
  id: string;
  action: string;
  resourceId: string;
  userId: string | null;
  rootAction: string | null;
  operationId: string | null;
  createdAt: string;
} {
  return {
    id: row.id,
    action: row.action,
    resourceId: row.resourceId,
    userId: row.userId,
    rootAction: row.rootAction,
    operationId: row.operationId,
    createdAt: row.createdAt.toISOString(),
  };
}