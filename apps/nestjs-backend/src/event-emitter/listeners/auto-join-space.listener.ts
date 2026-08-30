import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { getRandomString, Role } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import { CollaboratorType, PrincipalType } from '@teable/openapi';
import { Events } from '../events';
import { UserSignUpEvent } from '../events/user/user.event';

@Injectable()
export class AutoJoinSpaceListener {
  private readonly logger = new Logger(AutoJoinSpaceListener.name);

  constructor(private readonly prismaService: PrismaService) {}

  @OnEvent(Events.USER_SIGNUP, { async: true })
  async handleSignup(event: UserSignUpEvent): Promise<void> {
    try {
      const spaces = await this.prismaService.space.findMany({
        where: { autoJoin: true, deletedTime: null },
        select: { id: true },
      });

      if (spaces.length === 0) return;

      await this.prismaService.collaborator.createMany({
        data: spaces.map(({ id: spaceId }) => ({
          id: getRandomString(16),
          resourceId: spaceId,
          resourceType: CollaboratorType.Space,
          roleName: Role.Viewer,
          principalId: event.userId,
          principalType: PrincipalType.User,
          createdBy: event.userId,
        })),
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.error(
        `Failed to auto-join user ${event.userId}: ${(error as Error).message}`,
        (error as Error).stack
      );
    }
  }
}
