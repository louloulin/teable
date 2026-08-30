import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@teable/db-main-prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnouncementsService } from './announcements.service';

class FakePrisma {
  announcement = {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  announcementDismissal = {
    findMany: vi.fn(),
    upsert: vi.fn(),
  };
  collaborator = { findMany: vi.fn() };
}

describe('AnnouncementsService', () => {
  let prisma: FakePrisma;
  let service: AnnouncementsService;
  const baseInput = {
    form: 'banner' as const,
    level: 'info' as const,
    title: ' Planned ',
    body: ' Maintenance ',
    audience: 'everyone' as const,
    targetIds: [],
    startsAt: '2026-08-30T10:00:00.000Z',
    endsAt: '2026-08-30T11:00:00.000Z',
  };

  beforeEach(() => {
    prisma = new FakePrisma();
    service = new AnnouncementsService(prisma as unknown as PrismaService);
  });

  it('rejects invalid schedules and audience combinations', async () => {
    await expect(
      service.create({ ...baseInput, endsAt: baseInput.startsAt }, 'admin')
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ ...baseInput, targetIds: ['user-1'] }, 'admin')
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ ...baseInput, audience: 'users', targetIds: [] }, 'admin')
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create({ ...baseInput, form: 'sidebar-card', linkUrl: undefined }, 'admin')
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes and persists a valid announcement', async () => {
    prisma.announcement.create.mockResolvedValue({ id: 'ann_1' });
    await service.create({ ...baseInput, linkUrl: 'https://example.com' }, 'admin');
    expect(prisma.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Planned',
          body: 'Maintenance',
          createdBy: 'admin',
        }),
      })
    );
  });

  it('filters active announcements by audience and dismissal', async () => {
    const now = new Date('2026-08-30T10:30:00.000Z');
    prisma.announcement.findMany.mockResolvedValue([
      {
        id: 'all',
        audience: 'everyone',
        targetIds: [],
        startsAt: new Date('2026-08-30T10:00:00Z'),
        endsAt: new Date('2026-08-30T11:00:00Z'),
        withdrawnAt: null,
      },
      {
        id: 'user',
        audience: 'users',
        targetIds: ['user-1'],
        startsAt: new Date('2026-08-30T10:00:00Z'),
        endsAt: new Date('2026-08-30T11:00:00Z'),
        withdrawnAt: null,
      },
      {
        id: 'space',
        audience: 'spaces',
        targetIds: ['space-1'],
        startsAt: new Date('2026-08-30T10:00:00Z'),
        endsAt: new Date('2026-08-30T11:00:00Z'),
        withdrawnAt: null,
      },
    ]);
    prisma.collaborator.findMany.mockResolvedValue([{ resourceId: 'space-1' }]);
    prisma.announcementDismissal.findMany.mockResolvedValue([{ announcementId: 'user' }]);
    const result = await service.activeForUser('user-1', now);
    expect(result.map((item) => item.id)).toEqual(['all', 'space']);
  });

  it('withdraws only an active announcement and makes dismissal idempotent', async () => {
    prisma.announcement.findUnique.mockResolvedValue({
      id: 'ann_1',
      endsAt: new Date(Date.now() + 10000),
      withdrawnAt: null,
    });
    prisma.announcement.update.mockResolvedValue({ id: 'ann_1', withdrawnAt: new Date() });
    await service.withdraw('ann_1');
    expect(prisma.announcement.update).toHaveBeenCalled();
    prisma.announcementDismissal.upsert.mockResolvedValue({});
    await service.dismiss('ann_1', 'user-1');
    expect(prisma.announcementDismissal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ['announcementId_userId']: { announcementId: 'ann_1', userId: 'user-1' } },
      })
    );
  });

  it('reports missing announcements', async () => {
    prisma.announcement.findUnique.mockResolvedValue(null);
    await expect(service.withdraw('missing')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.dismiss('missing', 'user-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
