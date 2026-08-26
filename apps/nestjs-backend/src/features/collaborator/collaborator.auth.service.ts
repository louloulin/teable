/**
 * Collaborator — thin-DI wrapper (Stage N).
 *
 * Auth-only entry point: a single `getCollaboratorSummary(spaceId, userId)`
 * that resolves a user's role on a space via Prisma `findFirst`. The full
 * CRUD flow (createSpaceCollaborator / deleteCollaborator / updateCollaborator
 * …) stays in `CollaboratorService`.
 */

import { Injectable } from '@nestjs/common';
import { CollaboratorType, PrincipalType } from '@teable/openapi';
import { PrismaService } from '@teable/db-main-prisma';

import { toCollaboratorSummary } from './collaborator.helpers';
import type { ICollaboratorSummary } from './collaborator.types';

@Injectable()
export class CollaboratorAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolve a user's space-scoped collaborator summary; `null` when not found. */
  async getCollaboratorSummary(
    spaceId: string,
    userId: string
  ): Promise<ICollaboratorSummary | null> {
    const row = await this.prisma.collaborator.findFirst({
      where: {
        resourceId: spaceId,
        resourceType: CollaboratorType.Space,
        principalId: userId,
        principalType: PrincipalType.User,
      },
      select: {
        resourceId: true,
        resourceType: true,
        principalId: true,
        principalType: true,
        roleName: true,
        createdTime: true,
      },
    });
    if (!row) return null;
    return toCollaboratorSummary(row);
  }
}
