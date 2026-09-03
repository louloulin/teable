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

interface ITableFieldKeys {
  /** Map fieldName → fieldId */
  nameToId: Map<string, string>;
  /** Map fieldId → fieldName */
  idToName: Map<string, string>;
  fetchedAt: number;
}

@Injectable()
export class PermissionInterceptor implements NestInterceptor {
  private readonly logger = new Logger(PermissionInterceptor.name);
  private readonly FIELD_KEY_TTL_MS = 60_000;
  private readonly fieldKeyCache = new Map<string, ITableFieldKeys>();

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
    const ctx = this.readTableContext(req);
    const tableId = ctx.tableId;
    const baseIdHint = ctx.baseId;
    if (!tableId) return next.handle();

    const userId = this.cls.get('user')?.id;
    if (!userId) return next.handle();

    return from(this.resolveBaseId(tableId, baseIdHint)).pipe(
      mergeMap((resolvedBaseId) =>
        resolvedBaseId
          ? from(this.matrix.resolveRolesForUser(resolvedBaseId, userId))
          : from([[]] as IPermissionRoleVo[][])
      ),
      mergeMap((roles) => {
        if (roles.length === 0) {
          PermissionInterceptor.stashFilterOnReq(req, null);
          return next.handle();
        }
        const filter = this.matrix.mergeRecordFilters(roles, tableId);
        PermissionInterceptor.stashFilterOnReq(
          req,
          filter ? this.matrix.applyCurrentUser(filter, userId) : null
        );
        return from(this.resolveFieldKeys(tableId)).pipe(
          mergeMap((fieldKeys) =>
            next.handle().pipe(
              map((body) => this.projectResponse(body, roles, tableId, fieldKeys))
            )
          )
        );
      })
    );
  }

  private projectResponse(
    body: unknown,
    roles: IPermissionRoleVo[],
    tableId: string,
    fieldKeys: ITableFieldKeys | null
  ): unknown {
    if (Array.isArray(body)) return body.map((row) => this.projectRow(row, roles, tableId, fieldKeys));
    if (body && typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      if ('records' in obj && Array.isArray(obj.records)) {
        return {
          ...obj,
          records: obj.records.map((row) => this.projectRow(row, roles, tableId, fieldKeys)),
        };
      }
      return this.projectRow(body, roles, tableId, fieldKeys);
    }
    return body;
  }

  private projectRow(
    row: unknown,
    roles: IPermissionRoleVo[],
    tableId: string,
    fieldKeys: ITableFieldKeys | null
  ): unknown {
    if (!row || typeof row !== 'object') return row;
    const obj = row as Record<string, unknown>;
    const fields =
      obj.fields && typeof obj.fields === 'object'
        ? (obj.fields as Record<string, unknown>)
        : obj;
    const projected: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      const access = this.resolveFieldAccess(roles, tableId, key, fieldKeys);
      projected[key] = access === 'hidden' ? null : value;
    }
    return obj.fields && typeof obj.fields === 'object'
      ? { ...obj, fields: projected }
      : { ...obj, ...projected };
  }

  /**
   * Resolve field access — tries the key as-is (fieldId) first, then as fieldName
   * (looked up via cached table metadata). This is required because:
   *   - `getRecords` runs FieldKeyPipe (default fieldKeyType=Name) → keys are names
   *   - `getRecord` (single) does NOT run FieldKeyPipe → keys are still names but
   *     we must still support both for correctness with custom fieldKeyType
   *   - `fieldPermission` storage always uses fieldId
   */
  private resolveFieldAccess(
    roles: IPermissionRoleVo[],
    tableId: string,
    key: string,
    fieldKeys: ITableFieldKeys | null
  ): 'hidden' | 'readonly' | 'editable' | 'unset' {
    const direct = this.matrix.fieldAccess(roles, tableId, key);
    if (direct !== 'unset') return direct;
    if (!fieldKeys) return 'unset';
    const resolvedId = fieldKeys.nameToId.get(key);
    if (resolvedId && resolvedId !== key) {
      return this.matrix.fieldAccess(roles, tableId, resolvedId);
    }
    return 'unset';
  }

  private readTableContext(req: Record<string, unknown>): ITableContext {
    const params = (req.params ?? {}) as Record<string, string>;
    const query = (req.query ?? {}) as Record<string, string>;
    return {
      tableId: params.tableId ?? query.tableId ?? null,
      baseId: params.baseId ?? query.baseId ?? null,
    };
  }

  private async resolveBaseId(tableId: string, baseIdHint: string | null): Promise<string | null> {
    if (baseIdHint) return baseIdHint;
    if (!this.prisma) return null;
    const row = await this.prisma.tableMeta.findUnique({
      where: { id: tableId },
      select: { baseId: true },
    });
    return row?.baseId ?? null;
  }

  private async resolveFieldKeys(tableId: string): Promise<ITableFieldKeys | null> {
    if (!this.prisma) return null;
    const cached = this.fieldKeyCache.get(tableId);
    if (cached && Date.now() - cached.fetchedAt < this.FIELD_KEY_TTL_MS) {
      return cached;
    }
    const rows = await this.prisma.field.findMany({
      where: { tableId, deletedTime: null },
      select: { id: true, name: true },
    });
    const nameToId = new Map<string, string>();
    const idToName = new Map<string, string>();
    for (const r of rows) {
      if (r.name) nameToId.set(r.name, r.id);
      idToName.set(r.id, r.name ?? r.id);
    }
    const entry: ITableFieldKeys = { nameToId, idToName, fetchedAt: Date.now() };
    this.fieldKeyCache.set(tableId, entry);
    return entry;
  }

  static stashFilterOnReq(req: Record<string, unknown>, filter: PermissionFilter | null): void {
    (req as Record<string, unknown>).permission = { filter };
  }
}
