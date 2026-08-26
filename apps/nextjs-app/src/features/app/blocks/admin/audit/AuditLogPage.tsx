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
import type { IAuditListRow, IAuditListQuery, IAuditListVo } from '@teable/openapi';
import { listAuditOperations } from '@teable/openapi';
import { Skeleton } from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';
import { useCallback, useMemo, useState } from 'react';
import { exportAuditRows } from './audit-export';
import { AuditLogFilter } from './AuditLogFilter';
import { AuditLogTable } from './AuditLogTable';

const DEFAULT_LIMIT = 100;

export interface IAuditLogPageProps {
  /** Pre-rendered audit data when SSR is wired (matches the setting page
   *  pattern). Optional — the page is fully functional from the client. */
  initialRows?: IAuditListVo;
}

interface IAccumulatedState {
  rows: IAuditListRow[];
  nextCursor: string | null;
}

const filterRows = (
  rows: ReadonlyArray<IAuditListRow>,
  filter: IAuditListQuery
): IAuditListRow[] => {
  const keyword = ((filter as { keyword?: string }).keyword ?? '').trim().toLowerCase();
  const from = (filter as { from?: string }).from;
  const to = (filter as { to?: string }).to;
  const fromMs = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
  const toMs = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
  return rows.filter((row) => {
    if (Number.isFinite(fromMs) || Number.isFinite(toMs)) {
      const rowMs = Date.parse(row.createdAt);
      if (Number.isFinite(rowMs)) {
        if (rowMs < fromMs) return false;
        if (rowMs > toMs) return false;
      }
    }
    if (keyword.length === 0) return true;
    return (
      row.action.toLowerCase().includes(keyword) ||
      row.resourceId.toLowerCase().includes(keyword) ||
      (row.userId ?? '').toLowerCase().includes(keyword) ||
      (row.rootAction ?? '').toLowerCase().includes(keyword) ||
      (row.operationId ?? '').toLowerCase().includes(keyword)
    );
  });
};

export const AuditLogPage = ({ initialRows }: IAuditLogPageProps) => {
  const { t } = useTranslation('common');
  const [filter, setFilter] = useState<IAuditListQuery>({ limit: DEFAULT_LIMIT });
  const [accumulated, setAccumulated] = useState<IAccumulatedState>({
    rows: initialRows?.rows ?? [],
    nextCursor: initialRows?.nextCursor ?? null,
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-audit-operations', filter],
    queryFn: () => listAuditOperations(filter).then((res) => res.data),
    initialData: initialRows,
    refetchOnWindowFocus: false,
  });

  // Replace accumulated rows when the cursor advances / filter changes.
  // The page does NOT mutate `data` directly — TanStack Query owns the
  // server cache, and we own the cumulative list.
  const serverRows = data?.rows ?? accumulated.rows;
  const serverCursor = data?.nextCursor ?? accumulated.nextCursor;
  const visibleRows = useMemo(() => filterRows(serverRows, filter), [serverRows, filter]);
  const hasMore = Boolean(serverCursor) && serverRows.length > 0;

  const onApply = useCallback((next: IAuditListQuery) => {
    // Strip `cursor` from any submitted filter — the stream restarts
    // from the top whenever the user changes a constraint.
    const { cursor: _dropCursor, ...rest } = next as IAuditListQuery & { cursor?: string };
    setFilter({ ...rest, limit: rest.limit ?? DEFAULT_LIMIT });
    setAccumulated({ rows: [], nextCursor: null });
  }, []);

  const onLoadMore = useCallback(async () => {
    if (!serverCursor) return;
    const next = await listAuditOperations({ ...filter, cursor: serverCursor });
    setAccumulated((prev) => ({
      rows: [...prev.rows, ...next.data.rows],
      nextCursor: next.data.nextCursor,
    }));
  }, [filter, serverCursor]);

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
        <div className="text-muted-foreground mt-2 text-sm">
          {t(
            'admin.auditLog.description',
            'Read-only view of audit operations captured by the global audit interceptor and the @Audit() decorator. R1-T10 adds keyword / from / to filters and CSV / JSON export.'
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <AuditLogFilter
          value={filter}
          onApply={onApply}
          onRefresh={() => {
            setAccumulated({ rows: [], nextCursor: null });
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
