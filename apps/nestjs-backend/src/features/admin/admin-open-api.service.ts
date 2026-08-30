import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@teable/db-main-prisma';
import { PrismaService } from '@teable/db-main-prisma';
import { SettingKey } from '@teable/openapi';
import { AuditScope } from '../audit/audit-scope';
import { DeleteUserService } from '../user/delete-user/delete-user.service';

/**
 * Admin-panel read and instance-management helpers.
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
  constructor(
    private readonly prismaService: PrismaService,
    private readonly audit: AuditScope,
    private readonly deleteUserService: DeleteUserService
  ) {}

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
          isSystem: true,
          deactivatedTime: true,
          deletedTime: true,
          createdTime: true,
          lastSignTime: true,
        },
      }),
      this.prismaService.user.count({ where }),
    ]);

    return { list, total, skip, take };
  }

  async updateUser(input: {
    userId: string;
    requesterId?: string;
    active?: boolean;
    isAdmin?: boolean;
  }) {
    const user = await this.prismaService.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        isSystem: true,
        deactivatedTime: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.isSystem) {
      throw new BadRequestException('System users cannot be modified');
    }
    if (user.id === input.requesterId) {
      throw new BadRequestException('The current administrator cannot be modified');
    }
    if ((input.active === false || input.isAdmin === false) && user.isAdmin) {
      const activeAdminCount = await this.prismaService.user.count({
        where: {
          isAdmin: true,
          deactivatedTime: null,
          permanentDeletedTime: null,
          id: { not: user.id },
        },
      });
      if (activeAdminCount === 0) {
        throw new ConflictException('The last active administrator cannot be deactivated');
      }
    }

    const updated = await this.prismaService.user.update({
      where: { id: user.id },
      data: {
        ...(input.active === undefined
          ? {}
          : { deactivatedTime: input.active ? null : user.deactivatedTime ?? new Date() }),
        ...(input.isAdmin === undefined ? {} : { isAdmin: input.isAdmin }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        isSystem: true,
        deactivatedTime: true,
        deletedTime: true,
        createdTime: true,
        lastSignTime: true,
      },
    });
    await this.audit.emitAtomic({
      action: 'admin.user.update',
      resourceId: updated.id,
      payload: {
        userId: updated.id,
        active: !updated.deactivatedTime,
        isAdmin: updated.isAdmin,
      },
    });
    return updated;
  }

  private async getMutableUser(userId: string, requesterId?: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        isSystem: true,
        deactivatedTime: true,
        deletedTime: true,
        permanentDeletedTime: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.isSystem) throw new BadRequestException('System users cannot be modified');
    if (user.id === requesterId)
      throw new BadRequestException('The current administrator cannot be modified');
    if (user.permanentDeletedTime) throw new NotFoundException('User not found');
    return user;
  }

  async restoreUser(input: { userId: string; requesterId?: string }) {
    await this.getMutableUser(input.userId, input.requesterId);
    const updated = await this.prismaService.user.update({
      where: { id: input.userId },
      data: { deletedTime: null, deactivatedTime: null },
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        isSystem: true,
        deactivatedTime: true,
        deletedTime: true,
        createdTime: true,
        lastSignTime: true,
      },
    });
    await this.audit.emitAtomic({
      action: 'admin.user.restore',
      resourceId: updated.id,
      payload: {},
    });
    return updated;
  }

  async deleteUser(input: { userId: string; requesterId?: string; confirm: 'DELETE' }) {
    const user = await this.getMutableUser(input.userId, input.requesterId);
    if (user.isAdmin) {
      const activeAdminCount = await this.prismaService.user.count({
        where: {
          isAdmin: true,
          deactivatedTime: null,
          deletedTime: null,
          permanentDeletedTime: null,
          id: { not: user.id },
        },
      });
      if (activeAdminCount === 0)
        throw new ConflictException('The last active administrator cannot be deleted');
    }
    const updated = await this.prismaService.user.update({
      where: { id: user.id },
      data: { deletedTime: new Date(), deactivatedTime: user.deactivatedTime ?? new Date() },
      select: { id: true, deletedTime: true, deactivatedTime: true },
    });
    await this.audit.emitAtomic({
      action: 'admin.user.delete',
      resourceId: updated.id,
      payload: { deleted: true },
    });
    return updated;
  }

  async permanentlyDeleteUser(input: { userId: string; requesterId?: string; confirm: 'DELETE' }) {
    const user = await this.getMutableUser(input.userId, input.requesterId);
    if (user.isAdmin) {
      const activeAdminCount = await this.prismaService.user.count({
        where: {
          isAdmin: true,
          deactivatedTime: null,
          deletedTime: null,
          permanentDeletedTime: null,
          id: { not: user.id },
        },
      });
      if (activeAdminCount === 0)
        throw new ConflictException('The last active administrator cannot be deleted');
    }
    await this.deleteUserService.deleteUserById(user.id);
    await this.audit.emitAtomic({
      action: 'admin.user.permanent_delete',
      resourceId: user.id,
      payload: { permanent: true },
    });
    return { id: user.id, permanentDeleted: true };
  }

  async listSpaces(query: { skip: number; take: number }) {
    const { skip, take } = query;
    const where: Prisma.SpaceWhereInput = { deletedTime: null };

    const [spaces, total] = await Promise.all([
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
          autoJoin: true,
        },
      }),
      this.prismaService.space.count({ where }),
    ]);

    const list = await Promise.all(
      spaces.map(async (space) => {
        const [baseCount, collaboratorCount] = await Promise.all([
          this.prismaService.base.count({ where: { spaceId: space.id, deletedTime: null } }),
          this.prismaService.collaborator.count({
            where: { resourceId: space.id, resourceType: 'space', principalType: 'user' },
          }),
        ]);
        return { ...space, baseCount, collaboratorCount };
      })
    );

    return { list, total, skip, take };
  }

  async updateSpace(input: { spaceId: string; name?: string; autoJoin?: boolean }) {
    const space = await this.prismaService.space.findFirst({
      where: { id: input.spaceId, deletedTime: null },
      select: { id: true },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    const updated = await this.prismaService.space.update({
      where: { id: space.id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.autoJoin === undefined ? {} : { autoJoin: input.autoJoin }),
      },
      select: { id: true, name: true, createdBy: true, createdTime: true, autoJoin: true },
    });
    await this.audit.emitAtomic({
      action: 'admin.space.update',
      resourceId: updated.id,
      payload: { name: updated.name, autoJoin: updated.autoJoin },
    });
    return updated;
  }

  async deleteSpace(spaceId: string) {
    const space = await this.prismaService.space.findFirst({
      where: { id: spaceId, deletedTime: null },
      select: { id: true },
    });
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    const deleted = await this.prismaService.space.update({
      where: { id: space.id },
      data: { deletedTime: new Date() },
      select: { id: true },
    });
    await this.audit.emitAtomic({
      action: 'admin.space.delete',
      resourceId: deleted.id,
      payload: { deleted: true },
    });
    return { id: deleted.id, deleted: true };
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

  async getTableQueryOpsOverview(query: {
    spaceId?: string;
    baseId?: string;
    tableId?: string;
    limit: number;
  }) {
    const conditions: string[] = [];
    const params: string[] = [];
    const addScope = (column: string, value: string | undefined) => {
      if (!value) return;
      params.push(value);
      conditions.push(`${column} = $${params.length}`);
    };
    addScope('base_id', query.baseId);
    addScope('table_id', query.tableId);
    addScope('space_id', query.spaceId);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(query.limit, 1), 100);

    try {
      const [summaryRows, hotTables, recommendations, tasks] = await Promise.all([
        this.prismaService.$queryRawUnsafe<
          Array<{
            observationWindowCount: bigint;
            requestCount: bigint;
            slowCount: bigint;
            timeoutCount: bigint;
            dbErrorCount: bigint;
            recommendationCount: bigint;
            openRecommendationCount: bigint;
            acceptedRecommendationCount: bigint;
            taskCount: bigint;
            runningTaskCount: bigint;
            failedTaskCount: bigint;
          }>
        >(
          `SELECT
            (SELECT count(*) FROM meta.table_query_observation_window ${where}) AS "observationWindowCount",
            (SELECT coalesce(sum(request_count), 0) FROM meta.table_query_observation_window ${where}) AS "requestCount",
            (SELECT coalesce(sum(slow_count), 0) FROM meta.table_query_observation_window ${where}) AS "slowCount",
            (SELECT coalesce(sum(timeout_count), 0) FROM meta.table_query_observation_window ${where}) AS "timeoutCount",
            (SELECT coalesce(sum(db_error_count), 0) FROM meta.table_query_observation_window ${where}) AS "dbErrorCount",
            (SELECT count(*) FROM meta.table_query_recommendation ${where}) AS "recommendationCount",
            (SELECT count(*) FROM meta.table_query_recommendation ${where ? `${where} AND` : 'WHERE'} status = 'open') AS "openRecommendationCount",
            (SELECT count(*) FROM meta.table_query_recommendation ${where ? `${where} AND` : 'WHERE'} status = 'accepted') AS "acceptedRecommendationCount",
            (SELECT count(*) FROM meta.table_query_remediation_task task ${where ? `JOIN meta.base ON meta.base.id = task.base_id ${where.replaceAll('base_id', 'task.base_id').replaceAll('table_id', 'task.table_id').replaceAll('space_id', 'meta.base.space_id')}` : ''}) AS "taskCount",
            (SELECT count(*) FROM meta.table_query_remediation_task task ${where ? `JOIN meta.base ON meta.base.id = task.base_id ${where.replaceAll('base_id', 'task.base_id').replaceAll('table_id', 'task.table_id').replaceAll('space_id', 'meta.base.space_id')} AND task.status = 'running'` : `WHERE task.status = 'running'`}) AS "runningTaskCount",
            (SELECT count(*) FROM meta.table_query_remediation_task task ${where ? `JOIN meta.base ON meta.base.id = task.base_id ${where.replaceAll('base_id', 'task.base_id').replaceAll('table_id', 'task.table_id').replaceAll('space_id', 'meta.base.space_id')} AND task.status = 'failed'` : `WHERE task.status = 'failed'`}) AS "failedTaskCount"`,
          ...params
        ),
        this.prismaService.$queryRawUnsafe<unknown[]>(
          `SELECT space_id, base_id, table_id, sum(request_count)::bigint AS request_count,
            sum(slow_count)::bigint AS slow_count, sum(timeout_count)::bigint AS timeout_count,
            sum(db_error_count)::bigint AS db_error_count, max(max_duration_ms) AS max_duration_ms,
            max(window_start) AS latest_window_start
           FROM meta.table_query_observation_window ${where}
           GROUP BY space_id, base_id, table_id
           ORDER BY sum(request_count) DESC, max(max_duration_ms) DESC
           LIMIT ${limit}`,
          ...params
        ),
        this.prismaService.$queryRawUnsafe<unknown[]>(
          `SELECT id, space_id, base_id, table_id, shape_hash, policy_version, status,
            risk_level, risk_score, reason_codes, remediation_candidates, created_time, last_modified_time
           FROM meta.table_query_recommendation ${where}
           ORDER BY created_time DESC NULLS LAST LIMIT ${limit}`,
          ...params
        ),
        this.prismaService.$queryRawUnsafe<unknown[]>(
          `SELECT task.id, task.recommendation_id, task.base_id, task.table_id, task.kind, task.status, task.attempts,
            task.max_attempts, task.last_error, task.created_time, task.last_modified_time
           FROM meta.table_query_remediation_task task ${where ? `JOIN meta.base ON meta.base.id = task.base_id ${where.replaceAll('base_id', 'task.base_id').replaceAll('table_id', 'task.table_id').replaceAll('space_id', 'meta.base.space_id')}` : ''}
           ORDER BY task.created_time DESC NULLS LAST LIMIT ${limit}`,
          ...params
        ),
      ]);
      const row = summaryRows[0];
      const number = (value: bigint | number | null | undefined) => Number(value ?? 0);
      const jsonSafe = (value: unknown): unknown => {
        if (typeof value === 'bigint') return Number(value);
        if (Array.isArray(value)) return value.map(jsonSafe);
        if (value && typeof value === 'object') {
          return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, jsonSafe(entry)])
          );
        }
        return value;
      };
      return {
        enabled: true,
        summary: {
          observationWindowCount: number(row?.observationWindowCount),
          requestCount: number(row?.requestCount),
          slowCount: number(row?.slowCount),
          timeoutCount: number(row?.timeoutCount),
          dbErrorCount: number(row?.dbErrorCount),
          recommendationCount: number(row?.recommendationCount),
          openRecommendationCount: number(row?.openRecommendationCount),
          acceptedRecommendationCount: number(row?.acceptedRecommendationCount),
          taskCount: number(row?.taskCount),
          runningTaskCount: number(row?.runningTaskCount),
          failedTaskCount: number(row?.failedTaskCount),
        },
        hotTables: jsonSafe(hotTables),
        recommendations: jsonSafe(recommendations),
        tasks: jsonSafe(tasks),
      };
    } catch (error) {
      if (error instanceof Error && /relation .* does not exist/i.test(error.message)) {
        return {
          enabled: false,
          summary: null,
          hotTables: [],
          recommendations: [],
          tasks: [],
        };
      }
      throw error;
    }
  }

  async getAiGenerationQueueOverview() {
    let fields;
    try {
      fields = await this.prismaService.aiField.findMany({
        orderBy: { updatedTime: 'desc' },
        take: 100,
        select: {
          id: true,
          baseId: true,
          tableId: true,
          fieldId: true,
          operation: true,
          model: true,
          status: true,
          lastRunAt: true,
          lastErrorMessage: true,
          updatedTime: true,
        },
      });
    } catch (error) {
      if (error instanceof Error && /table .*ai_field.* does not exist/i.test(error.message)) {
        return {
          queue: {
            available: false,
            waiting: null,
            processing: null,
            reason: 'AI field persistence tables are not initialized in this database.',
          },
          summary: {
            configuredFields: 0,
            enabledFields: 0,
            errorFields: 0,
            lastHourRuns: 0,
            byStatus: { ok: 0, failed: 0, rateLimited: 0, skipped: 0 },
          },
          fields: [],
          recentRuns: [],
        };
      }
      throw error;
    }
    const fieldIds = fields.map((field) => field.id);
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const runs = fieldIds.length
      ? await this.prismaService.aiFieldRun.findMany({
          where: { aiFieldId: { in: fieldIds }, startedAt: { gte: since } },
          orderBy: { startedAt: 'desc' },
          take: 500,
          select: {
            id: true,
            aiFieldId: true,
            recordId: true,
            status: true,
            model: true,
            durationMs: true,
            errorMessage: true,
            startedAt: true,
            finishedAt: true,
          },
        })
      : [];
    const byStatus = { ok: 0, failed: 0, rateLimited: 0, skipped: 0 };
    for (const run of runs) {
      if (run.status === 'ok') byStatus.ok += 1;
      else if (run.status === 'failed') byStatus.failed += 1;
      else if (run.status === 'rate-limited') byStatus.rateLimited += 1;
      else if (run.status === 'skipped') byStatus.skipped += 1;
    }
    return {
      queue: {
        available: false,
        waiting: null,
        processing: null,
        reason:
          'AI field generation is event-driven; no persistent queue is currently implemented.',
      },
      summary: {
        configuredFields: fields.length,
        enabledFields: fields.filter((field) => field.status === 'enabled').length,
        errorFields: fields.filter((field) => field.status === 'error').length,
        lastHourRuns: runs.length,
        byStatus,
      },
      fields,
      recentRuns: runs.slice(0, 100),
    };
  }
}
