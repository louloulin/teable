import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, Optional, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { HttpErrorCode } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import { ClsService } from 'nestjs-cls';

import { CustomHttpException } from '../../custom.exception';
import type { IClsStore } from '../../types/cls';
import { PermissionMatrixService } from './permission-matrix.service';

export const PERMISSION_ACTION_META = 'permission:action';
export type PermissionAction = 'view' | 'update' | 'create' | 'delete' | 'comment';

/**
 * `@RequirePermission('update')` — opt-in guard that throws 403 when the
 * user's role set on this table does not allow the named action. Skips
 * silently when:
 *
 *   - the user has no role set on this base (admin / owner / explicit
 *     perms keep working unchanged),
 *   - the route didn't opt in via the decorator.
 *
 * Keeps existing handlers unchanged; only adds a guard before the route
 * fires.
 */
export const RequirePermission = (action: PermissionAction) =>
  SetMetadata(PERMISSION_ACTION_META, action);

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly matrix: PermissionMatrixService,
    private readonly cls: ClsService<IClsStore>,
    private readonly reflector: Reflector,
    @Optional() private readonly prisma?: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const handler = typeof context.getHandler === 'function' ? context.getHandler() : undefined;
    const cls = typeof context.getClass === 'function' ? context.getClass() : undefined;
    const action = this.reflector.getAllAndOverride<PermissionAction>(PERMISSION_ACTION_META, [
      handler ?? PermissionGuard,
      cls ?? PermissionGuard,
    ]);
    if (!action) return true;

    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    const { tableId, baseId: requestedBaseId } = this.readTableContext(req);
    if (!tableId) return true;

    const baseId = requestedBaseId ?? (await this.resolveBaseId(tableId));
    if (!baseId) return true;

    const userId = this.cls.get('user')?.id;
    if (!userId) return true;

    const roles = await this.matrix.resolveRolesForUser(baseId, userId);
    if (roles.length === 0) return true;

    if (!this.matrix.allowsAction(roles, tableId, action)) {
      throw new CustomHttpException(
        `permission denied: ${action} on ${tableId}`,
        HttpErrorCode.RESTRICTED_RESOURCE,
        { meta: { tableId, baseId, action } }
      );
    }
    if (action === 'update' || action === 'create') {
      await this.assertFieldEditAllowed(req, tableId, baseId, roles);
    }
    return true;
  }

  /**
   * Reject the request when ANY field in the patch body is hidden by
   * the user's role set. Readonly fields pass through — they will be
   * caught by a future stricter check, but for now we don't block.
   *
   * Lives on the guard so the controller handler stays unaware.
   */
  async assertFieldEditAllowed(
    req: Record<string, unknown>,
    tableId: string,
    baseId: string,
    resolvedRoles?: Awaited<ReturnType<PermissionMatrixService['resolveRolesForUser']>>
  ): Promise<void> {
    const userId = this.cls.get('user')?.id;
    if (!userId) return;
    const roles = resolvedRoles ?? (await this.matrix.resolveRolesForUser(baseId, userId));
    if (roles.length === 0) return;
    const body = (req.body ?? {}) as {
      fields?: Record<string, unknown>;
      record?: { fields?: Record<string, unknown> };
      records?: Array<{ fields?: Record<string, unknown> }>;
    };
    const fieldSets = [
      body.fields,
      body.record?.fields,
      ...(body.records ?? []).map((record) => record.fields),
    ].filter((fields): fields is Record<string, unknown> => !!fields && typeof fields === 'object');
    for (const fields of fieldSets) {
      for (const fieldId of Object.keys(fields)) {
        const access = this.matrix.fieldAccess(roles, tableId, fieldId);
        if (access === 'hidden') {
          throw new CustomHttpException(
            `field hidden by permission: ${fieldId}`,
            HttpErrorCode.RESTRICTED_RESOURCE,
            { meta: { fieldId, tableId } }
          );
        }
      }
    }
  }

  private async resolveBaseId(tableId: string): Promise<string | null> {
    if (!this.prisma) return null;
    const table = await this.prisma.tableMeta.findUnique({
      where: { id: tableId },
      select: { baseId: true },
    });
    return table?.baseId ?? null;
  }

  private readTableContext(req: Record<string, unknown>): {
    tableId: string | null;
    baseId: string | null;
  } {
    const params = (req.params ?? {}) as Record<string, string>;
    const query = (req.query ?? {}) as Record<string, string>;
    return {
      tableId: params.tableId ?? query.tableId ?? null,
      baseId: params.baseId ?? query.baseId ?? null,
    };
  }
}
