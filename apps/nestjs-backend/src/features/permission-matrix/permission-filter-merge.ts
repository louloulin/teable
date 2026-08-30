import type { PermissionFilter } from './permission-matrix.constants';
import { mergeFilter, type IFilter } from '@teable/core';

/**
 * Stage 5b — drop-in helper for record read handlers to AND-merge the
 * row-level permission filter (stashed by `PermissionInterceptor` on
 * `req.permission.filter`) with the existing Prisma `where` clause.
 *
 * Returns the existing `where` unchanged when:
 *   - the request never opted in via `@RequirePermissionFilter()`, or
 *   - the user has no roles with a row filter on this table.
 *
 * When a filter IS present, the merge is `AND` (the role filter is a
 * narrowing constraint — it can never widen what an existing query
 * would have returned).
 *
 * Existing read handlers can adopt this by a single line replacement;
 * no controller signature changes are required.
 */
export function applyPermissionFilter<T extends Record<string, unknown>>(
  req: { permission?: { filter?: PermissionFilter | null } } | undefined,
  where: T
): T {
  const filter = req?.permission?.filter;
  if (!filter || Object.keys(filter).length === 0) return where;
  return { AND: [where, filter] } as unknown as T;
}

export function applyPermissionFilterToRecordQuery<T extends { filter?: IFilter | null }>(
  req: { permission?: { filter?: PermissionFilter | null } } | undefined,
  query: T
): T {
  const permissionFilter = req?.permission?.filter;
  if (!isRecordFilter(permissionFilter)) return query;

  return {
    ...query,
    filter: mergeFilter(query.filter ?? undefined, permissionFilter),
  } as T;
}

function isRecordFilter(value: PermissionFilter | null | undefined): value is IFilter {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      'conjunction' in value &&
      ('filterSet' in value) &&
      Array.isArray((value as { filterSet?: unknown }).filterSet)
  );
}
