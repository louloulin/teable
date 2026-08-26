import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';

import { CustomHttpException } from '../../custom.exception';
import { HttpErrorCode } from '@teable/core';
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
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<PermissionAction>(PERMISSION_ACTION_META, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    const { tableId, baseId } = this.readTableContext(req);
    if (!tableId || !baseId) return true;

    const userId = this.cls.get('user')?.id;
    if (!userId) return true;

    // G2-001: even when no @RequirePermission() decorator is on the route,
    // we still want to enforce hidden-field protection on write methods.
    // Skip read paths so list endpoints don't pay the per-field access cost.
    const method = ((req as { method?: string }).method ?? 'GET').toUpperCase();
    const isWriteMethod =
      method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';

    // No opt-in metadata and read path → fall through (existing OSS admin/owner path).
    if (!action && !isWriteMethod) return true;

    const roles = await this.matrix.resolveRolesForUser(baseId, userId);
    if (roles.length === 0) return true;

    // @RequirePermission() decorated routes still get the strict action check.
    if (action && !this.matrix.allowsAction(roles, tableId, action)) {
      throw new CustomHttpException(
        `permission denied: ${action} on ${tableId}`,
        HttpErrorCode.RESTRICTED_RESOURCE,
        { meta: { tableId, baseId, action } }
      );
    }

    // G2-001: hidden-field write protection on POST/PATCH/PUT/DELETE.
    // Cheap when the role set has no fieldPermissions configured (matrix.fieldAccess
    // short-circuits to 'unset'), so we always run it on writes.
    if (isWriteMethod) {
      await this.assertFieldEditAllowed(req, tableId, baseId);
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
    baseId: string
  ): Promise<void> {
    const userId = this.cls.get('user')?.id;
    if (!userId) return;
    const roles = await this.matrix.resolveRolesForUser(baseId, userId);
    if (roles.length === 0) return;
    const body = (req.body ?? {}) as { fields?: Record<string, unknown> };
    const fields = body.fields ?? body;
    if (typeof fields !== 'object' || fields === null) return;
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
