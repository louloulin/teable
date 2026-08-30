import type { ExecutionContext, CallHandler, NestInterceptor } from '@nestjs/common';
import { Injectable, Logger, Optional, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@teable/db-main-prisma';
import { ClsService } from 'nestjs-cls';
import { from } from 'rxjs';
import type { Observable } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';

import type { IClsStore } from '../../types/cls';
import type { IPermissionRoleVo, PermissionFilter } from './permission-matrix.constants';
import { PermissionMatrixService } from './permission-matrix.service';

export const PERMISSION_INTERCEPTOR_META = 'permission:intercept';
export const RequirePermissionFilter = () => SetMetadata(PERMISSION_INTERCEPTOR_META, true);

interface ITableContext {
  tableId: string | null;
  baseId: string | null;
}

/**
 * Additive interceptor. When a route is annotated with
 * `@RequirePermissionFilter()`, it:
 *
 *   1. Resolves the user's role set via PermissionMatrixService.
 *   2. If any role declares a record filter for this table, AND-merges
 *      them and stashes it on `req.permission.filter` so a downstream
 *      query-builder decorator (or this same interceptor's response
 *      projection) can read it.
 *   3. Projects hidden / readonly fields out of the response body.
 *
 * Routes that don't declare the metadata are untouched — the existing
 * permission.service.ts path keeps running. Zero changes to controllers
 * are required for the read path; controllers that want server-side
 * filter injection opt in by adding `@UseInterceptors(...)` next to the
 * metadata.
 */
@Injectable()
export class PermissionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PermissionInterceptor.name);

  constructor(
    private readonly matrix: PermissionMatrixService,
    private readonly cls: ClsService<IClsStore>,
    private readonly reflector: Reflector,
    @Optional() private readonly prisma?: PrismaService
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const enabled = this.reflector.getAllAndOverride<boolean>(PERMISSION_INTERCEPTOR_META, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!enabled) return next.handle();

    const req = context.switchToHttp().getRequest<Record<string, unknown>>();
    const { tableId, baseId } = this.readTableContext(req);
    if (!tableId) return next.handle();

    const userId = this.cls.get('user')?.id;
    if (!userId) return next.handle();

    return from(this.resolveBaseId(tableId, baseId)).pipe(
      mergeMap((resolvedBaseId) =>
        resolvedBaseId ? from(this.matrix.resolveRolesForUser(resolvedBaseId, userId)) : from([[]])
      ),
      mergeMap((roles) => {
        const filter = this.matrix.mergeRecordFilters(roles, tableId);
        PermissionInterceptor.stashFilterOnReq(
          req,
          filter ? this.matrix.applyCurrentUser(filter, userId) : null
        );
        return next
          .handle()
          .pipe(
            map((body) => (roles.length === 0 ? body : this.projectResponse(body, roles, tableId)))
          );
      })
    );
  }

  private async resolveBaseId(tableId: string, baseId: string | null): Promise<string | null> {
    if (baseId) return baseId;
    if (!this.prisma) return null;
    const table = await this.prisma.tableMeta.findUnique({
      where: { id: tableId },
      select: { baseId: true },
    });
    return table?.baseId ?? null;
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
