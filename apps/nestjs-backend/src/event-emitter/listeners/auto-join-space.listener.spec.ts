import type { PrismaService } from '@teable/db-main-prisma';
import { CollaboratorType, PrincipalType } from '@teable/openapi';
import { vi } from 'vitest';
import { Events } from '../events';
import { UserSignUpEvent } from '../events/user/user.event';
import { AutoJoinSpaceListener } from './auto-join-space.listener';

describe('AutoJoinSpaceListener', () => {
  it('adds viewer collaborators to every active auto-join space', async () => {
    const prisma = {
      space: { findMany: vi.fn().mockResolvedValue([{ id: 'spc-1' }, { id: 'spc-2' }]) },
      collaborator: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    } as unknown as PrismaService;
    const listener = new AutoJoinSpaceListener(prisma);

    await listener.handleSignup(new UserSignUpEvent('usr-1'));

    expect(prisma.space.findMany).toHaveBeenCalledWith({
      where: { autoJoin: true, deletedTime: null },
      select: { id: true },
    });
    expect(prisma.collaborator.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          resourceId: 'spc-1',
          resourceType: CollaboratorType.Space,
          roleName: 'viewer',
          principalId: 'usr-1',
          principalType: PrincipalType.User,
          createdBy: 'usr-1',
        }),
      ]),
      skipDuplicates: true,
    });
  });

  it('does not write when no spaces are configured', async () => {
    const prisma = {
      space: { findMany: vi.fn().mockResolvedValue([]) },
      collaborator: { createMany: vi.fn() },
    } as unknown as PrismaService;
    const listener = new AutoJoinSpaceListener(prisma);

    await listener.handleSignup(new UserSignUpEvent('usr-1'));

    expect(prisma.collaborator.createMany).not.toHaveBeenCalled();
  });

  it('subscribes to the signup event name', () => {
    expect(new UserSignUpEvent('usr-1').name).toBe(Events.USER_SIGNUP);
  });
});
