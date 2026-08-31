import { randomBytes } from 'crypto';

import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService, PermissionRoleStatus } from '@teable/db-main-prisma';
import { ClsService } from 'nestjs-cls';

import type { IClsStore } from '../../types/cls';
import { CustomHttpException } from '../../custom.exception';
import { HttpErrorCode } from '@teable/core';

import {
  IPermissionRoleVo,
  PermissionFilter,
  filterReferencesCurrentUser,
} from './permission-matrix.constants';

interface ICreateRoleInput {
  baseId: string;
  name: string;
  description?: string;
  createdBy: string;
}

/**
 * Permission matrix service.
 *
 * Three concerns:
 *   1. CRUD roles + members + per-table settings.
 *   2. Cache the active role set per user so the request hot-path stays
 *      cheap (one prisma call per request, cached for 30 s).
 *   3. Resolve "what can this user do to this record/field" for guards.
 *
 * Role assignment is the union of all roles the user holds on the base
 * — same user with `销售代表` + `全局客户观察员` gets the union of
 * permissions, matching the guide's "复盘视角" example.
 */
@Injectable()
export class PermissionMatrixService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionMatrixService.name);
  private readonly cache = new Map<string, { value: IPermissionRoleVo[]; expiresAt: number }>();
  private readonly TTL_MS = 30 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  onApplicationBootstrap(): void {
    // No bootstrap action — cache fills lazily on first request.
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async createRole(input: ICreateRoleInput): Promise<IPermissionRoleVo> {
    const exists = await this.prisma.permissionRole.findFirst({
      where: { baseId: input.baseId, name: input.name },
    });
    if (exists) {
      throw new CustomHttpException('role already exists', HttpErrorCode.CONFLICT);
    }
    const row = await this.prisma.permissionRole.create({
      data: {
        id: `pr_${randomBytes(10).toString('hex')}`,
        baseId: input.baseId,
        name: input.name,
        description: input.description ?? null,
        status: PermissionRoleStatus.enabled,
        createdBy: input.createdBy,
      },
    });
    this.invalidate(input.baseId);
    return this.toVo(row);
  }

  async listRoles(baseId: string): Promise<IPermissionRoleVo[]> {
    const rows = await this.prisma.permissionRole.findMany({
      where: { baseId },
      orderBy: { createdAt: 'asc' },
      include: { members: true, nodes: true, fieldPerms: true, recordActions: true, recordFilters: true },
    });
    return Promise.all(rows.map((r) => this.toVo(r)));
  }

  async deleteRole(baseId: string, roleId: string): Promise<void> {
    const row = await this.prisma.permissionRole.findUnique({ where: { id: roleId } });
    if (!row || row.baseId !== baseId) {
      throw new CustomHttpException('role not found', HttpErrorCode.NOT_FOUND);
    }
    await this.prisma.permissionRole.delete({ where: { id: roleId } });
    this.invalidate(baseId);
  }

  async setRoleEnabled(baseId: string, roleId: string, enabled: boolean) {
    const row = await this.prisma.permissionRole.findUnique({ where: { id: roleId } });
    if (!row || row.baseId !== baseId) {
      throw new CustomHttpException('role not found', HttpErrorCode.NOT_FOUND);
    }
    const updated = await this.prisma.permissionRole.update({
      where: { id: roleId },
      data: { status: enabled ? PermissionRoleStatus.enabled : PermissionRoleStatus.disabled },
    });
    this.invalidate(baseId);
    return updated;
  }

  // ─── node access (table / app / workflow) ──────────────────────────────
  // Cloud Business §权限矩阵 splits "节点权限" into three sub-types. For
  // backwards compat the legacy setTableAccess() writes to the (table, tableId)
  // shape; setNodeAccess() writes to the (nodeType, nodeId) shape so app and
  // workflow permissions can be modeled on the same table.

  async setTableAccess(
    baseId: string,
    roleId: string,
    tableId: string,
    access: 'none' | 'editable'
  ) {
    return this.setNodeAccess(baseId, roleId, 'table', tableId, access);
  }

  async setNodeAccess(
    baseId: string,
    roleId: string,
    nodeType: 'table' | 'app' | 'workflow',
    nodeId: string,
    access: 'none' | 'editable'
  ) {
    await this.assertRole(baseId, roleId);
    // New unique key is (roleId, nodeType, nodeId) — see migration
    // 20260831130000_extend_permission_role_node_with_node_type.
    await this.prisma.permissionRoleNode.upsert({
      where: {
        roleId_nodeType_nodeId: { roleId, nodeType, nodeId },
      } as unknown as { roleId_tableId: { roleId: string; tableId: string } },
      create: {
        id: `prn_${randomBytes(10).toString('hex')}`,
        roleId,
        nodeType,
        nodeId,
        tableId: nodeType === 'table' ? nodeId : `${nodeType}_${nodeId}`,
        access,
      },
      update: { access },
    });
    this.invalidate(baseId);
  }
  // ─── import / export gate (Cloud Business §权限矩阵 §导入/导出权限) ─────
  // Independent axis from recordAction. canImport gates CSV/Excel import
  // endpoints; canExport gates CSV export endpoint per role per table.

  async setImportExport(
    baseId: string,
    roleId: string,
    tableId: string,
    canImport: boolean,
    canExport: boolean
  ) {
    await this.assertRole(baseId, roleId);
    await this.prisma.permissionRoleImportExport.upsert({
      where: { roleId_tableId: { roleId, tableId } },
      create: {
        id: `prie_${randomBytes(10).toString('hex')}`,
        roleId,
        tableId,
        canImport,
        canExport,
      },
      update: { canImport, canExport },
    });
    this.invalidate(baseId);
  }

  // ─── field permissions ──────────────────────────────────────────────────

  async setFieldPermission(
    baseId: string,
    roleId: string,
    tableId: string,
    fieldId: string,
    access: 'hidden' | 'readonly' | 'editable'
  ) {
    await this.assertRole(baseId, roleId);
    await this.prisma.permissionRoleFieldPermission.upsert({
      where: { roleId_fieldId: { roleId, fieldId } },
      create: { id: `prf_${randomBytes(10).toString('hex')}`, roleId, tableId, fieldId, access },
      update: { access },
    });
    this.invalidate(baseId);
  }

  // ─── record actions ────────────────────────────────────────────────────

  async setRecordAction(
    baseId: string,
    roleId: string,
    tableId: string,
    action: 'view' | 'update' | 'create' | 'delete' | 'comment',
    enabled: boolean
  ) {
    await this.assertRole(baseId, roleId);
    if (enabled) {
      await this.prisma.permissionRoleRecordAction.upsert({
        where: { roleId_tableId_action: { roleId, tableId, action } },
        create: { id: `pra_${randomBytes(10).toString('hex')}`, roleId, tableId, action },
        update: {},
      });
    } else {
      await this.prisma.permissionRoleRecordAction.deleteMany({
        where: { roleId, tableId, action },
      });
    }
    this.invalidate(baseId);
  }

  // ─── record filter ─────────────────────────────────────────────────────

  async setRecordFilter(
    baseId: string,
    roleId: string,
    tableId: string,
    filter: PermissionFilter
  ) {
    await this.assertRole(baseId, roleId);
    if (filter === null) {
      await this.prisma.permissionRoleRecordFilter.deleteMany({
        where: { roleId, tableId },
      });
    } else {
      await this.prisma.permissionRoleRecordFilter.upsert({
        where: { roleId_tableId: { roleId, tableId } },
        create: { id: `prrf_${randomBytes(10).toString('hex')}`, roleId, tableId, filter },
        update: { filter },
      });
    }
    this.invalidate(baseId);
  }

  /**
   * Round-26: Import/Export permission gate (Cloud Business §权限矩阵 §导入/导出权限).
   * canImport gates CSV/Excel import endpoints; canExport gates CSV export
   * endpoints per role per table. Independent axis from recordAction.
   */
  async setImportExport(
    baseId: string,
    roleId: string,
    tableId: string,
    canImport: boolean,
    canExport: boolean
  ): Promise<{ id: string; roleId: string; tableId: string; canImport: boolean; canExport: boolean }> {
    await this.assertRole(baseId, roleId);
    const id = `prie_${randomBytes(10).toString('hex')}`;
    const row = await this.prisma.permissionRoleImportExport.upsert({
      where: { roleId_tableId: { roleId, tableId } },
      create: { id, roleId, tableId, canImport, canExport },
      update: { canImport, canExport },
    });
    this.invalidate(baseId);
    return {
      id: row.id,
      roleId: row.roleId,
      tableId: row.tableId,
      canImport: row.canImport,
      canExport: row.canExport,
    };
  }

  async listImportExport(
    baseId: string,
    roleId: string
  ): Promise<Array<{ id: string; tableId: string; canImport: boolean; canExport: boolean }>> {
    await this.assertRole(baseId, roleId);
    const rows = await this.prisma.permissionRoleImportExport.findMany({
      where: { roleId },
      orderBy: { tableId: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      tableId: r.tableId,
      canImport: r.canImport,
      canExport: r.canExport,
    }));
  }

  async deleteImportExport(baseId: string, roleId: string, tableId: string): Promise<{ ok: boolean; deleted: number }> {
    await this.assertRole(baseId, roleId);
    const { count } = await this.prisma.permissionRoleImportExport.deleteMany({
      where: { roleId, tableId },
    });
    this.invalidate(baseId);
    return { ok: true, deleted: count };
  }

  // ─── members ───────────────────────────────────────────────────────────

  async addMember(baseId: string, roleId: string, userId: string) {
    await this.assertRole(baseId, roleId);
    await this.prisma.permissionRoleMember.upsert({
      where: { roleId_userId: { roleId, userId } },
      create: { id: `prm_${randomBytes(10).toString('hex')}`, roleId, userId },
      update: {},
    });
    this.invalidate(baseId);
  }

  async removeMember(baseId: string, roleId: string, userId: string) {
    await this.assertRole(baseId, roleId);
    await this.prisma.permissionRoleMember.deleteMany({
      where: { roleId, userId },
    });
    this.invalidate(baseId);
  }

  // ─── resolution ────────────────────────────────────────────────────────

  /**
   * Resolve the role set the user has on a base. Returns an empty array
   * when the user has no roles → guards then fall through to the existing
   * OSS path (admin / owner / explicit perms), so this stays purely
   * additive.
   */
  async resolveRolesForUser(baseId: string, userId: string): Promise<IPermissionRoleVo[]> {
    const cached = this.cache.get(this.cacheKey(baseId, userId));
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const rows = await this.prisma.permissionRole.findMany({
      where: {
        baseId,
        status: PermissionRoleStatus.enabled,
        members: { some: { userId } },
      },
      orderBy: { createdAt: 'asc' },
      include: { members: true, nodes: true, fieldPerms: true, recordActions: true, recordFilters: true },
    });
    const vos = await Promise.all(rows.map((r) => this.toVo(r)));
    this.cache.set(this.cacheKey(baseId, userId), {
      value: vos,
      expiresAt: Date.now() + this.TTL_MS,
    });
    return vos;
  }

  /**
   * Union of all "view" actions granted by any of the user's roles.
   * Used by `RecordQueryPermissionInterceptor` to decide whether to even
   * attempt filtering, vs. falling through to the existing read path.
   */
  hasAnyViewOn(roles: IPermissionRoleVo[], tableId: string): boolean {
    return roles.some(
      (r) =>
        r.nodes.some((n) => n.tableId === tableId && n.access === 'editable') &&
        r.recordActions.some((a) => a.tableId === tableId && a.action === 'view')
    );
  }

  /** AND across roles — matches the guide's "permission union" rule. */
  mergeRecordFilters(
    roles: IPermissionRoleVo[],
    tableId: string
  ): PermissionFilter | null {
    const filters = roles
      .map((r) => r.recordFilter)
      .filter((f): f is NonNullable<typeof f> => Boolean(f && f.tableId === tableId))
      .map((f) => f.filter);
    if (filters.length === 0) return null;
    if (filters.length === 1) return filters[0];
    return { conjunction: 'and', filterSet: filters };
  }

  /** Field-level projection: hidden > readonly > editable wins. */
  fieldAccess(
    roles: IPermissionRoleVo[],
    tableId: string,
    fieldId: string
  ): 'hidden' | 'readonly' | 'editable' | 'unset' {
    const accesses = roles
      .flatMap((r) => r.fieldPermissions)
      .filter((fp) => fp.tableId === tableId && fp.fieldId === fieldId)
      .map((fp) => fp.access);
    if (accesses.length === 0) return 'unset';
    if (accesses.includes('hidden')) return 'hidden';
    if (accesses.includes('editable')) return 'editable';
    return 'readonly';
  }

  /** True iff any role allows this record action. */
  allowsAction(
    roles: IPermissionRoleVo[],
    tableId: string,
    action: 'view' | 'update' | 'create' | 'delete' | 'comment'
  ): boolean {
    return roles.some(
      (r) =>
        r.nodes.some((n) => n.tableId === tableId && n.access === 'editable') &&
        r.recordActions.some((a) => a.tableId === tableId && a.action === action)
    );
  }

  /**
   * Substitute `$current_user` placeholders inside the filter with the
   * actual authenticated user id. Done in-place on a deep clone so the
   * cached filter object stays intact.
   */
  applyCurrentUser(filter: PermissionFilter, userId: string): PermissionFilter {
    if (!filterReferencesCurrentUser(filter)) return filter;
    const cloned = JSON.parse(JSON.stringify(filter)) as unknown;
    return this.substitute(cloned, userId) as PermissionFilter;
  }

  private substitute(node: unknown, userId: string): unknown {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map((n) => this.substitute(n, userId));
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === 'value' && v === '$current_user') {
          out[k] = userId;
        } else {
          out[k] = this.substitute(v, userId);
        }
      }
      return out;
    }
    return node;
  }

  // ─── private helpers ───────────────────────────────────────────────────

  private async assertRole(baseId: string, roleId: string) {
    const row = await this.prisma.permissionRole.findUnique({ where: { id: roleId } });
    if (!row || row.baseId !== baseId) {
      throw new CustomHttpException('role not found', HttpErrorCode.NOT_FOUND);
    }
  }

  private invalidate(baseId: string) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${baseId}:`)) this.cache.delete(key);
    }
  }

  private cacheKey(baseId: string, userId: string): string {
    return `${baseId}:${userId}`;
  }

  private async toVo(row: {
    id: string;
    baseId: string;
    name: string;
    description: string | null;
    status: PermissionRoleStatus;
    members?: { userId: string }[];
    nodes?: { tableId: string; access: 'none' | 'editable' }[];
    fieldPerms?: {
      tableId: string;
      fieldId: string;
      access: 'hidden' | 'readonly' | 'editable';
    }[];
    recordActions?: {
      tableId: string;
      action: 'view' | 'update' | 'create' | 'delete' | 'comment';
    }[];
    recordFilters?: { tableId: string; filter: PermissionFilter }[];
  }): Promise<IPermissionRoleVo> {
    return {
      id: row.id,
      baseId: row.baseId,
      name: row.name,
      description: row.description,
      status: row.status,
      members: (row.members ?? []).map((m) => m.userId),
      nodes: row.nodes ?? [],
      fieldPermissions: row.fieldPerms ?? [],
      recordActions: row.recordActions ?? [],
      recordFilter: row.recordFilters?.[0] ?? null,
    };
  }
}
