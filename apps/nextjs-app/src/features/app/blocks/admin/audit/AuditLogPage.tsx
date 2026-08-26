/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Admin audit log page — R1-T03 frontend bridge.
 *
 * Wraps the AuditLogFilter + AuditLogTable pair inside the standard admin
 * layout chrome. The page is intentionally read-only: it lists rows
 * emitted by `AuditScope.emitAtomic` and the global `AuditInterceptor`,
 * filtered by `action` / `resourceId` / `limit`. No mutation paths live
 * here — audit rows are append-only.
 */
import { useTranslation } from 'next-i18next';
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { IAuditListQuery, IAuditListVo } from '@teable/openapi';
import { listAuditOperations } from '@teable/openapi';
import { Skeleton } from '@teable/ui-lib/shadcn';
import { AuditLogFilter } from './AuditLogFilter';
import { AuditLogTable } from './AuditLogTable';

const DEFAULT_LIMIT = 100;

export interface IAuditLogPageProps {
  /** Pre-rendered audit data when SSR is wired (matches the setting page
   *  pattern). Optional — the page is fully functional from the client. */
  initialRows?: IAuditListVo;
}

export const AuditLogPage = ({ initialRows }: IAuditLogPageProps) => {
  const { t } = useTranslation('common');
  const [filter, setFilter] = useState<IAuditListQuery>({ limit: DEFAULT_LIMIT });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-audit-operations', filter],
    queryFn: () => listAuditOperations(filter).then((res) => res.data),
    initialData: initialRows,
    refetchOnWindowFocus: false,
  });

  const onApply = useCallback((next: IAuditListQuery) => {
    setFilter({ ...next, limit: next.limit ?? DEFAULT_LIMIT });
  }, []);

  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">{t('admin.auditLog.title', 'Audit Log')}</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          {t(
            'admin.auditLog.description',
            'Read-only view of audit operations captured by the global audit interceptor and the @Audit() decorator.'
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <AuditLogFilter
          value={filter}
          onApply={onApply}
          onRefresh={() => void refetch()}
          isFetching={isFetching}
        />

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <AuditLogTable rows={data?.rows ?? []} total={data?.total ?? 0} />
        )}
      </div>
    </div>
  );
};