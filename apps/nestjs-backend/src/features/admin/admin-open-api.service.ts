import { Injectable } from '@nestjs/common';
import type { Prisma } from '@teable/db-main-prisma';
import { PrismaService } from '@teable/db-main-prisma';
import { SettingKey } from '@teable/openapi';

/**
 * Stage 7 admin-panel read-side helpers.
 *
 * These methods back `GET /api/admin/*` routes. The controller applies the
 * `LicenseCapabilityGuard.for('<cap>')` gate; the service stays purely a
 * Prisma reader so it never has to consult the license — that concern is
 * the controller's. Keeping them separate also means unit tests don't need
 * to wire the license subsystem for every list query.
 *
 * Conventions:
 *   - `skip` / `take` come pre-validated by `ZodValidationPipe` on the
 *     controller (>= 0 / 1..max). Service trusts the caller.
 *   - All lists return `{ list, total, skip, take }` so the admin panel
 *     can render pagination without a second round-trip.
 *   - SELECTs are explicit: admin surfaces never carry `password`,
 *     `salt`, or `refMeta` even when the capability is granted.
 */
@Injectable()
export class AdminOpenApiService {
  constructor(private readonly prismaService: PrismaService) {}

  async listUsers(query: { skip: number; take: number; search?: string }) {
    const { skip, take, search } = query;
    const trimmed = search?.trim();
    const where: Prisma.UserWhereInput = trimmed
      ? {
          permanentDeletedTime: null,
          OR: [
            { name: { contains: trimmed, mode: 'insensitive' } },
            { email: { contains: trimmed, mode: 'insensitive' } },
          ],
        }
      : { permanentDeletedTime: null };

    const [list, total] = await Promise.all([
      this.prismaService.user.findMany({
        where,
        orderBy: { createdTime: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          email: true,
          isAdmin: true,
          deactivatedTime: true,
          createdTime: true,
          lastSignTime: true,
        },
      }),
      this.prismaService.user.count({ where }),
    ]);

    return { list, total, skip, take };
  }

  async listSpaces(query: { skip: number; take: number }) {
    const { skip, take } = query;
    const where: Prisma.SpaceWhereInput = { deletedTime: null };

    const [list, total] = await Promise.all([
      this.prismaService.space.findMany({
        where,
        orderBy: { createdTime: 'desc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          createdBy: true,
          createdTime: true,
        },
      }),
      this.prismaService.space.count({ where }),
    ]);

    return { list, total, skip, take };
  }

  async listPublishedTemplates(query: { skip: number; take: number }) {
    const { skip, take } = query;
    const where: Prisma.TemplateWhereInput = { isPublished: true };

    const [list, total] = await Promise.all([
      this.prismaService.template.findMany({
        where,
        orderBy: { order: 'asc' },
        skip,
        take,
        select: {
          id: true,
          name: true,
          baseId: true,
          createdBy: true,
          isPublished: true,
          featured: true,
          visitCount: true,
          usageCount: true,
          createdTime: true,
        },
      }),
      this.prismaService.template.count({ where }),
    ]);

    return { list, total, skip, take };
  }

  async getAiSettings() {
    const row = await this.prismaService.setting.findFirst({
      where: { name: SettingKey.AI_CONFIG },
      select: { content: true },
    });
    const raw = row?.content ?? null;
    let aiConfig: unknown = null;
    if (typeof raw === 'string') {
      try {
        aiConfig = JSON.parse(raw);
      } catch {
        aiConfig = raw;
      }
    } else if (raw !== null) {
      aiConfig = raw;
    }
    return { aiConfig };
  }

  async getQuotaDashboard(query: { skip: number; take: number }) {
    const { skip, take } = query;

    const [list, total] = await Promise.all([
      this.prismaService.quotaHit.findMany({
        orderBy: { createdTime: 'desc' },
        skip,
        take,
        select: {
          id: true,
          spaceId: true,
          metric: true,
          attempted: true,
          cap: true,
          actorId: true,
          resource: true,
          createdTime: true,
        },
      }),
      this.prismaService.quotaHit.count(),
    ]);

    return { list, total, skip, take };
  }
}