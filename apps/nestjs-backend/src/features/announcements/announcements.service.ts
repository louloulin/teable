import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

export type AnnouncementForm = 'banner' | 'toast' | 'modal' | 'sidebar-card';
export type AnnouncementLevel = 'info' | 'maintenance' | 'critical' | 'resolved';
export type AnnouncementAudience = 'everyone' | 'spaces' | 'users';

export interface ICreateAnnouncementInput {
  form: AnnouncementForm;
  level: AnnouncementLevel;
  title: string;
  body: string;
  linkText?: string;
  linkUrl?: string;
  audience: AnnouncementAudience;
  targetIds: string[];
  startsAt: string;
  endsAt: string;
}

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: ICreateAnnouncementInput, createdBy: string) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(endsAt.getTime()) ||
      endsAt <= startsAt
    ) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    if (input.audience === 'everyone' && input.targetIds.length > 0) {
      throw new BadRequestException('everyone announcements cannot have targetIds');
    }
    if (input.audience !== 'everyone' && input.targetIds.length === 0) {
      throw new BadRequestException('targetIds are required for targeted announcements');
    }
    if (input.form === 'sidebar-card' && !input.linkUrl) {
      throw new BadRequestException('sidebar-card announcements require linkUrl');
    }
    return this.prisma.announcement.create({
      data: {
        id: `ann_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
        form: input.form,
        level: input.level,
        title: input.title.trim(),
        body: input.body.trim(),
        linkText: input.linkText?.trim() || null,
        linkUrl: input.linkUrl?.trim() || null,
        audience: input.audience,
        targetIds: input.targetIds,
        startsAt,
        endsAt,
        createdBy,
      },
    });
  }

  async list(now = new Date()) {
    const rows = await this.prisma.announcement.findMany({ orderBy: { createdTime: 'desc' } });
    return rows.map((row) => ({ ...row, status: this.status(row, now) }));
  }

  async withdraw(id: string) {
    const row = await this.prisma.announcement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Announcement not found');
    if (row.withdrawnAt || row.endsAt <= new Date()) {
      throw new BadRequestException('Only active announcements can be withdrawn');
    }
    return this.prisma.announcement.update({ where: { id }, data: { withdrawnAt: new Date() } });
  }

  async activeForUser(userId: string, now = new Date()) {
    const rows = await this.prisma.announcement.findMany({
      where: { startsAt: { lte: now }, endsAt: { gt: now }, withdrawnAt: null },
      orderBy: { startsAt: 'asc' },
    });
    const [memberships, dismissed] = await Promise.all([
      this.prisma.collaborator.findMany({
        where: { principalId: userId, principalType: 'user', resourceType: 'space' },
        select: { resourceId: true },
      }),
      this.prisma.announcementDismissal.findMany({
        where: { userId },
        select: { announcementId: true },
      }),
    ]);
    const spaces = new Set(memberships.map((membership) => membership.resourceId));
    const dismissedIds = new Set(dismissed.map((item) => item.announcementId));
    return rows
      .filter((row) => !dismissedIds.has(row.id))
      .filter((row) => {
        const targetIds = Array.isArray(row.targetIds)
          ? row.targetIds.filter((id): id is string => typeof id === 'string')
          : [];
        return (
          row.audience === 'everyone' ||
          (row.audience === 'users' && targetIds.includes(userId)) ||
          (row.audience === 'spaces' && targetIds.some((id) => spaces.has(id)))
        );
      })
      .map((row) => ({ ...row, status: 'active' as const }));
  }

  async dismiss(id: string, userId: string) {
    const row = await this.prisma.announcement.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Announcement not found');
    await this.prisma.announcementDismissal.upsert({
      where: { ['announcementId_userId']: { announcementId: id, userId } },
      create: {
        id: `and_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
        announcementId: id,
        userId,
      },
      update: { dismissedAt: new Date() },
    });
    return { ok: true };
  }

  private status(row: { startsAt: Date; endsAt: Date; withdrawnAt: Date | null }, now: Date) {
    if (row.withdrawnAt) return 'withdrawn' as const;
    if (row.endsAt <= now) return 'expired' as const;
    if (row.startsAt > now) return 'scheduled' as const;
    return 'active' as const;
  }
}
