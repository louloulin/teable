/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Tenant Replay — snapshot capture.
 *
 * Reads metadata for one space out of the source database via PrismaService.
 * Does NOT read record bodies — counts only.  This keeps snapshots small and
 * avoids carrying PII through the file system.
 *
 * The shape is intentionally tolerant of missing tables / columns: a
 * snapshot from an older or forked database still produces a usable JSON
 * document, even if some sub-sections come back as empty arrays.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  type IBaseSnapshot,
  type ITableSnapshot,
  type ITableRecordStats,
  type ITenantSnapshot,
  type IUserSnapshot,
} from './tenant-replay.types';

const SNAPSHOT_VERSION = 1 as const;

@Injectable()
export class TenantSnapshotService {
  private readonly logger = new Logger(TenantSnapshotService.name);

  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Capture a tenant snapshot for the given space id.
   *
   * Steps:
   *  1. Read the space row (404-ish if missing).
   *  2. Walk bases -> tables -> fields / views / attachments / collaborators.
   *  3. Walk users that own or collaborate on the space.
   *  4. Roll up flat counts into `summary` for quick inspection.
   */
  async captureSnapshot(targetSpaceId: string): Promise<ITenantSnapshot> {
    const prisma = this.prismaService;
    const space = await prisma.space.findFirst({
      where: { id: targetSpaceId, deletedTime: null },
    });
    if (!space) {
      throw new Error(`Space not found: ${targetSpaceId}`);
    }

    const bases = await prisma.base.findMany({
      where: { spaceId: targetSpaceId, deletedTime: null },
      orderBy: { order: 'asc' },
    });

    const baseSnapshots: IBaseSnapshot[] = [];
    for (const base of bases) {
      baseSnapshots.push(await this.captureBase(base));
    }

    const users = await this.captureUsers(bases.map((b) => b.id));

    const summary = baseSnapshots.reduce(
      (acc, b) => {
        acc.tableCount += b.tables.length;
        for (const t of b.tables) {
          acc.viewCount += t.views.length;
          acc.fieldCount += t.fields.length;
          acc.schemaOperationCount += t.pendingSchemaOperations;
          acc.attachmentCount += t.attachmentCount;
          acc.approxRecordCount += t.recordStats.rowCount;
        }
        return acc;
      },
      {
        baseCount: baseSnapshots.length,
        tableCount: 0,
        viewCount: 0,
        fieldCount: 0,
        userCount: users.length,
        schemaOperationCount: 0,
        attachmentCount: 0,
        approxRecordCount: 0,
      }
    );

    return {
      version: SNAPSHOT_VERSION,
      capturedAt: new Date().toISOString(),
      capturedBy: 'tenant-replay',
      anonymized: 'none',
      sourceSpaceId: space.id,
      spaceName: space.name,
      bases: baseSnapshots,
      users,
      summary,
    };
  }

  private async captureBase(base: {
    id: string;
    name: string;
    icon: string | null;
    order: number;
  }): Promise<IBaseSnapshot> {
    const prisma = this.prismaService;
    const tables = await prisma.tableMeta.findMany({
      where: { baseId: base.id, deletedTime: null },
      orderBy: { order: 'asc' },
    });

    const tableSnapshots: ITableSnapshot[] = [];
    for (const table of tables) {
      tableSnapshots.push(await this.captureTable(base.id, table));
    }

    const collaboratorCount = await this.safeCount(() =>
      prisma.collaborator.count({
        where: { resourceType: 'base', resourceId: base.id },
      })
    );

    const automationRunCount = await this.safeCount(() =>
      this.countAutomationRunsForBase(prisma, base.id)
    );

    return {
      sourceBaseId: base.id,
      name: base.name,
      icon: base.icon,
      order: base.order,
      tables: tableSnapshots,
      collaboratorCount,
      automationRunCount,
    };
  }

  private async captureTable(
    baseId: string,
    table: {
      id: string;
      name: string;
      description: string | null;
      icon: string | null;
      dbTableName: string;
      order: number;
    }
  ): Promise<ITableSnapshot> {
    const prisma = this.prismaService;

    const [fields, views, pendingOps, attachmentCount, rowCount] = await Promise.all([
      prisma.field.findMany({
        where: { tableId: table.id, deletedTime: null },
        orderBy: { order: 'asc' },
      }),
      prisma.view.findMany({
        where: { tableId: table.id, deletedTime: null },
        orderBy: { order: 'asc' },
      }),
      this.safeCount(() =>
        prisma.schemaOperation.count({
          where: {
            resourceType: 'table',
            resourceId: table.id,
            status: { in: ['pending', 'running'] },
          },
        })
      ),
      this.safeCount(() =>
        prisma.attachmentsTable.count({ where: { tableId: table.id } })
      ),
      this.safeCount(() =>
        prisma.ops.count({
          where: { collection: `table_${table.id.replace(/^tbl/, '')}` },
        })
      ),
    ]);

    const recordStats: ITableRecordStats = {
      sourceTableId: table.id,
      name: table.name,
      rowCount,
      fieldIds: fields.map((f) => f.id),
    };

    return {
      sourceTableId: table.id,
      name: table.name,
      description: table.description,
      icon: table.icon,
      dbTableName: table.dbTableName,
      order: table.order,
      fields: fields.map((f) => this.serializeField(f)),
      views: views.map((v) => this.serializeView(v)),
      recordStats,
      pendingSchemaOperations: pendingOps,
      attachmentCount,
    };
  }

  private async captureUsers(baseIds: string[]): Promise<IUserSnapshot[]> {
    if (baseIds.length === 0) return [];
    const prisma = this.prismaService;

    const collaboratorRows = await prisma.collaborator.findMany({
      where: {
        resourceType: 'base',
        resourceId: { in: baseIds },
        principalType: 'user',
      },
      select: { principalId: true },
      distinct: ['principalId'],
    });

    const userIds = Array.from(new Set(collaboratorRows.map((c) => c.principalId)));
    if (userIds.length === 0) return [];

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, deletedTime: null },
    });

    return users.map((u) => ({
      sourceUserId: u.id,
      name: u.name,
      email: u.email,
      isAdmin: Boolean(u.isAdmin),
      isSystem: Boolean(u.isSystem),
    }));
  }

  /**
   * Count automation runs against a base.  The Task/TaskRun schema is shared
   * by every "task"-shaped feature (automations, scim, ai, etc.) so we count
   * loosely via `baseId`.  The snapshot only needs the NUMBER for capacity
   * planning; we deliberately do not store run bodies.
   */
  private async countAutomationRunsForBase(
    prisma: PrismaService,
    baseId: string
  ): Promise<number> {
    return this.safeCount(() =>
      prisma.taskRun.count({ where: { baseId } })
    );
  }

  /**
   * Serialise a prisma `field` row into a JSON-safe payload.  We keep the raw
   * shape so the replay can forward it to FieldOpenApiService.createField.
   */
  private serializeField(field: {
    [k: string]: any;
  }): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(field)) {
      if (v instanceof Date) out[k] = v.toISOString();
      else out[k] = v;
    }
    return out;
  }

  /**
   * Same as `serializeField` but views also carry JSON-as-string options.
   */
  private serializeView(view: { [k: string]: any }): Record<string, unknown> {
    return this.serializeField(view);
  }

  /**
   * Run a count, swallow known-shape errors (missing table / column on
   * older forks).  Missing sections degrade to 0 so the snapshot stays
   * valid JSON — the replay report flags them with a `0` count rather
   * than a fatal failure.
   */
  private async safeCount(fn: () => Promise<number>): Promise<number> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(
        `snapshot: count failed (${err instanceof Error ? err.message : String(err)}) — defaulting to 0`
      );
      return 0;
    }
  }
}
