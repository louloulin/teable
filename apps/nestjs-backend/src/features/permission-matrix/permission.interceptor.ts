import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { from, Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

import type { IClsStore } from '../../types/cls';
import { PermissionMatrixService } from './permission-matrix.service';
import { IPermissionRoleVo, PermissionFilter } from './permission-matrix.constants';

// Legacy opt-in helper kept around for any out-of-tree callers; the global
// APP_INTERCEPTOR no longer requires this metadata to fire.
export const PERMISSION_INTERCEPTOR_META = 'permission:intercept';
export const RequirePermissionFilter = () => SetMetadata(PERMISSION_INTERCEPTOR_META, true);

interface ITableContext {
  tableId: string | null;
  baseId: string | null;
}

/**
 * Global APP_INTERCEPTOR (wired in `apps/nestjs-backend/src/global/global.module.ts`).
 *
 *   1. Resolves the user's role set via PermissionMatrixService for every
 *      request that carries `tableId` + `baseId` context.
 *   2. Stashes the AND-merged record filter on `req.permission.filter` (with
 *      any `$current_user` placeholders substituted from `cls.user.id`) so
 *      downstream query-builder code or Prisma `where` composition can
 *      AND-merge it without re-running the merge.
 *   3. Projects hidden / readonly fields out of the response body.
 *
 * Routes without table/base context, routes for unauthenticated users, and
 * routes for users with no role assignments on the base fall through
 * untouched (the existing admin / owner / explicit perms path keeps
 * running). This keeps the change purely additive — no existing handler
 * body logic is altered.
 */
@Injectable()
export class PermissionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PermissionInterceptor.name);

  constructor(
    private readonly matrix: PermissionMatrixService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    const { tableId, baseId } = this.readTableContext(req);
    if (!tableId || !baseId) return next.handle();

    const userId = this.cls.get('user')?.id;
    if (!userId) return next.handle();

    return from(this.prepareRequest(req, tableId, baseId, userId)).pipe(
      // After the (potentially no-op) prepare step, forward to the next handler.
      mergeMap(() => next.handle()),
      // Run projection on the response; null filter still projects any roles.
      mergeMap((body) => from(this.projectResponseForUser(body, req, tableId, baseId, userId)))
    );
  }

  /**
   * Resolve roles once per request, stash the merged filter on `req.permission`,
   * substitute `$current_user` placeholders, and return. No-op when the user
   * has no roles on the base.
   */
  private async prepareRequest(
    req: Record<string, unknown>,
    tableId: string,
    baseId: string,
    userId: string
  ): Promise<void> {
    try {
      const roles = await this.matrix.resolveRolesForUser(baseId, userId);
      if (roles.length === 0) {
        PermissionInterceptor.stashFilterOnReq(req, null);
        return;
      }
      const rawFilter = this.matrix.mergeRecordFilters(roles, tableId);
      const appliedFilter = rawFilter ? this.matrix.applyCurrentUser(rawFilter, userId) : null;
      PermissionInterceptor.stashFilterOnReq(req, appliedFilter);
    } catch (err) {
      // Don't let a permission-service outage break unrelated reads.
      this.logger.warn(
        `PermissionInterceptor.prepareRequest failed; falling through: ${(err as Error)?.message ?? err}`
      );
      PermissionInterceptor.stashFilterOnReq(req, null);
    }
  }

  private async projectResponseForUser(
    body: unknown,
    req: Record<string, unknown>,
    tableId: string,
    baseId: string,
    userId: string
  ): Promise<unknown> {
    try {
      const roles = await this.matrix.resolveRolesForUser(baseId, userId);
      if (roles.length === 0) return body;
      return this.projectResponse(body, roles, tableId);
    } catch (err) {
      this.logger.warn(
        `PermissionInterceptor projection failed; returning un-projected body: ${(err as Error)?.message ?? err}`
      );
      return body;
    }
  }

  /**
   * Walk the response and remove / blank fields the user is not allowed
   * to read. Hidden → null + (recursively) drop key. Readonly → keep
   * value but the write-path guard will refuse edits.
   */
  private projectResponse(body: unknown, roles: IPermissionRoleVo[], tableId: string): unknown {
    if (body === null || body === undefined) return body;
    if (Array.isArray(body)) return body.map((row) => this.projectRow(row, roles, tableId));
    if (typeof body === 'object') {
      // `records` / `record` envelope — recurse into records only.
      const obj = body as Record<string, unknown>;
      if ('records' in obj && Array.isArray(obj.records)) {
        return {
          ...obj,
          records: obj.records.map((row) => this.projectRow(row, roles, tableId)),
        };
      }
      return this.projectRow(body, roles, tableId);
    }
    return body;
  }

  private projectRow(row: unknown, roles: IPermissionRoleVo[], tableId: string): unknown {
    if (!row || typeof row !== 'object') return row;
    const obj = row as Record<string, unknown>;
    const fields = (
      obj.fields && typeof obj.fields === 'object' ? (obj.fields as Record<string, unknown>) : obj
    ) as Record<string, unknown>;
    const projected: Record<string, unknown> = {};
    for (const [fieldId, value] of Object.entries(fields)) {
      const access = this.matrix.fieldAccess(roles, tableId, fieldId);
      if (access === 'hidden') {
        projected[fieldId] = null;
      } else {
        projected[fieldId] = value;
      }
    }
    return obj.fields && typeof obj.fields === 'object'
      ? { ...obj, fields: projected }
      : { ...obj, ...projected };
  }

  private readTableContext(req: Record<string, unknown>): ITableContext {
    const params = (req.params ?? {}) as Record<string, string>;
    const query = (req.query ?? {}) as Record<string, string>;
    return {
      tableId: params.tableId ?? query.tableId ?? null,
      baseId: params.baseId ?? query.baseId ?? null,
    };
  }

  /**
   * Helper exposed for downstream callers (controller-level decorators)
   * to read the AND-merged filter pre-computed by the service. Stored
   * on `req.permission.filter` so the read handler can append it to the
   * Prisma `where` clause without re-running the merge.
   */
  static stashFilterOnReq(req: Record<string, unknown>, filter: PermissionFilter | null): void {
    (req as Record<string, unknown>).permission = { filter };
  }
}
