/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Cross-org admin grants — runtime service (Round-INFRA-5).
 *
 * Tracks per-space admin grants (which user can administer which space beyond
 * their home space). Backed by the real `crossOrgAdminGrant` Prisma model.
 *
 * License: AGPL-3.0
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import type { ICrossOrgAdminGrant } from './cross-org-admin.types';

@Injectable()
export class CrossOrgAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listGrants(input?: {
    userId?: string;
    spaceId?: string;
    orgId?: string;
  }): Promise<ICrossOrgAdminGrant[]> {
    const rows = await this.prisma.crossOrgAdminGrant.findMany({
      where: {
        userId: input?.userId,
        ...(input?.spaceId || input?.orgId
          ? { spaceId: input.spaceId ?? input.orgId }
          : {}),
      },
      orderBy: { createdTime: 'desc' },
    });
    return rows.map(toGrant);
  }

  async grant(input: {
    userId: string;
    spaceId: string;
    grantedBy: string;
    role?: string;
    reason?: string | null;
    expiresAt?: Date | null;
  }): Promise<ICrossOrgAdminGrant> {
    const id = `coag_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const row = await this.prisma.crossOrgAdminGrant.create({
      data: {
        id,
        userId: input.userId,
        spaceId: input.spaceId,
        grantedBy: input.grantedBy,
        role: input.role ?? 'admin',
        reason: input.reason ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
    return toGrant(row);
  }

  async revoke(id: string): Promise<boolean> {
    const existing = await this.prisma.crossOrgAdminGrant.findUnique({ where: { id } });
    if (!existing || existing.revokedAt) return false;
    await this.prisma.crossOrgAdminGrant.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return true;
  }

  async count(): Promise<number> {
    return (await this.listGrants()).length;
  }
}

function toGrant(row: {
  id: string;
  userId: string;
  spaceId: string;
  grantedBy: string;
  role: string;
  reason: string | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdTime: Date;
}): ICrossOrgAdminGrant {
  return {
    id: row.id,
    userId: row.userId,
    spaceId: row.spaceId,
    orgId: row.spaceId,
    grantedBy: row.grantedBy,
    grantedAt: row.createdTime,
    createdTime: row.createdTime,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    role: row.role,
    reason: row.reason,
    scopes: row.role === 'owner' ? ['space:*', 'base:*'] : ['space:read', 'space:list'],
  };
}
