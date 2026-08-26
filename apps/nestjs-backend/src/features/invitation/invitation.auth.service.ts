/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Invitation — NestJS thin-DI auth service (Stage N).
 *
 * Auth-only entry point for invitations: look up an invite by id and
 * return the validated record. Uses only `findUnique` against Prisma;
 * the full invite lifecycle stays in `InvitationService`.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { isInvitationExpired, normalizeInvitationEmail } from './invitation.helpers';
import type { IInvitationRecord, IValidatedInvitation } from './invitation.types';

@Injectable()
export class InvitationAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveInvitation(invitationId: string): Promise<IValidatedInvitation> {
    const row = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!row) {
      throw new NotFoundException('invitation not found');
    }
    const record: IInvitationRecord = {
      id: row.id,
      spaceId: row.spaceId,
      email: row.email,
      role: row.role,
      invitedBy: row.invitedBy,
      expiredTime: row.expiredTime,
    };
    if (isInvitationExpired(record)) {
      throw new NotFoundException('invitation expired');
    }
    return {
      invitationId: record.id,
      spaceId: record.spaceId,
      email: normalizeInvitationEmail(record.email),
      role: record.role,
      expiredTime: record.expiredTime?.toISOString() ?? null,
    };
  }
}