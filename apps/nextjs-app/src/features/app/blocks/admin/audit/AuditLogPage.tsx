/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Admin audit log page — R1-T10 DSL surface.
 *
 * Layered responsibilities:
 *
 *   1. `filter` — the active server-side query (action / resourceId /
 *      limit / cursor). The page clears `cursor` on every `onApply`
 *      because a fresh filter restarts the stream from the top.
 *
 *   2. `rows` / `nextCursor` — TanStack Query holds the most recent
 *      server response. The page appends new pages onto `rows` so the
 *      table shows the full history the user has paged through.
 *
 *   3. `visibleRows` — applies the keyword / from / to filters
 *      client-side. The server does NOT yet honour those (T-10 only
 *      threads them through openapi as optional fields), so the page
 *      narrows the displayed set in memory.
 *
 *   4. Export — calls `exportAuditRows(visibleRows, 'csv' | 'json')`
 *      so users can capture the exact rows they currently see.
 */
import { useQuery } from '@tanstack/react-query';
import type { IAuditListQuery, IAuditListVo } from '@teable/openapi';
import { listAuditOperations, listAuditOperationsSummary } from '@teable/openapi';
import { Skeleton } from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo, useState } from 'react';
import { exportAuditRows } from './audit-export';
import { AuditLogFilter } from './AuditLogFilter';
import { AuditLogTable } from './AuditLogTable';

const DEFAULT_PAGE_SIZE = 20;

export interface IAuditLogPageProps {
  /** Pre-rendered audit data when SSR is wired (matches the setting page
   *  pattern). Optional — the page is fully functional from the client. */
  initialRows?: IAuditListVo;
}

export const AuditLogPage = ({ initialRows }: IAuditLogPageProps) => {
  const { t } = useTranslation('common');
  const [filter, setFilter] = useState<IAuditListQuery>({ pageSize: DEFAULT_PAGE_SIZE });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-audit-operations', filter],
    queryFn: () => listAuditOperations(filter).then((res) => res.data),
    initialData: initialRows,
    refetchOnWindowFocus: false,
  });
  const { data: summary } = useQuery({
    queryKey: ['admin-audit-operations-summary', filter],
    queryFn: () => listAuditOperationsSummary(filter).then((res) => res.data),
    refetchOnWindowFocus: false,
  });

  const visibleRows = useMemo(
    () => data?.rows ?? initialRows?.rows ?? [],
    [data?.rows, initialRows?.rows]
  );
  const page = filter.page ?? 1;
  const pageSize = filter.pageSize ?? DEFAULT_PAGE_SIZE;
  const hasMore = page * pageSize < (data?.total ?? 0);

  const onApply = useCallback((next: IAuditListQuery) => {
    // Strip `cursor` from any submitted filter — the stream restarts
    // from the top whenever the user changes a constraint.
    setFilter({ ...next, page: 1, pageSize: next.pageSize ?? DEFAULT_PAGE_SIZE });
  }, []);

  const onLoadMore = useCallback(() => {
    if (hasMore) setFilter((current) => ({ ...current, page: (current.page ?? 1) + 1 }));
  }, [hasMore]);

  const onExportCsv = useCallback(() => {
    exportAuditRows(visibleRows, 'csv');
  }, [visibleRows]);

  const onExportJson = useCallback(() => {
    exportAuditRows(visibleRows, 'json');
  }, [visibleRows]);

  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">{t('admin.auditLog.title', 'Audit Log')}</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          {t(
            'admin.auditLog.description',
            'Read-only view of audit operations captured by the global audit interceptor and the @Audit() decorator. R1-T10 adds keyword / from / to filters and CSV / JSON export.'
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">Matching events</div>
            <div className="mt-1 text-2xl font-semibold">{summary?.total ?? data?.total ?? 0}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-sm text-muted-foreground">Distinct actions</div>
            <div className="mt-1 text-2xl font-semibold">{summary?.distinctActions ?? 0}</div>
          </div>
        </div>
        <AuditLogFilter
          value={filter}
          onApply={onApply}
          onRefresh={() => {
            void refetch();
          }}
          onExportCsv={onExportCsv}
          onExportJson={onExportJson}
          isFetching={isFetching}
          hasRows={visibleRows.length > 0}
        />

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <AuditLogTable
            rows={visibleRows}
            total={data?.total ?? visibleRows.length}
            hasMore={hasMore}
            isLoadingMore={isFetching}
            onLoadMore={onLoadMore}
          />
        )}
      </div>
    </div>
  );
};
