/**
 * Audit — thin-DI wrapper (Stage N).
 *
 * Read-only auth surface for the audit log. Wraps `prisma.auditLog.findMany`
 * (where `auditLog` is the logical store keyed off the AUDIT_LOG_EMIT event
 * channel) and exposes a single `listAuditOperations` entry point with
 * trivial filter + limit semantics.
 */

import { Injectable } from '@nestjs/common';
import type { PrismaService } from '@teable/db-main-prisma';

import { clampAuditLimit, matchesAuditFilter } from './audit.helpers';
import type { IAuditListFilter, IAuditListResult, IAuditLogRow } from './audit.types';

@Injectable()
export class AuditAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** List audit operations matching an optional `action` / `resourceId` filter. */
  async listAuditOperations(filter: IAuditListFilter = {}): Promise<IAuditListResult> {
    const limit = clampAuditLimit(filter.limit);
    // The audit store is exposed under prisma.auditLog.findMany at runtime;
    // the generated client is narrowed here so the auth surface stays
    // self-contained without coupling to other feature services.
    const prismaAny = this.prisma as unknown as {
      auditLog?: {
        findMany(args: {
          where?: Record<string, unknown>;
          orderBy?: Record<string, 'asc' | 'desc'>;
          take?: number;
        }): Promise<IAuditLogRow[]>;
      };
    };
    const rows = (await prismaAny.auditLog?.findMany?.({
      where: {
        ...(filter.action ? { action: filter.action } : {}),
        ...(filter.resourceId ? { resourceId: filter.resourceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })) ?? [];
    const filtered = rows.filter((row) => matchesAuditFilter(row, filter));
    const nextCursor = filtered.length === limit ? filtered[filtered.length - 1]?.id ?? null : null;
    return { rows: filtered, nextCursor };
  }
}
