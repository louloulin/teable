import { useQuery } from '@tanstack/react-query';
import { listAdminQuotaHits } from '@teable/openapi';
import { Skeleton } from '@teable/ui-lib/shadcn';

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

export const AdminOperationsPage = () => {
  const quota = useQuery({
    queryKey: ['admin', 'quota-dashboard'],
    queryFn: () => listAdminQuotaHits({ take: 50 }).then(({ data }) => data),
  });

  if (quota.isLoading) {
    return (
      <div className="flex h-screen flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (quota.error) {
    return (
      <div className="flex h-screen flex-1 items-start p-4 text-sm text-destructive sm:p-8">
        {quota.error instanceof Error ? quota.error.message : 'Unable to load admin operations'}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-1 flex-col gap-8 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Operations</h1>
        <p className="text-sm text-muted-foreground">
          Quota and runtime events. Manage users and spaces from their dedicated pages.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Quota events ({quota.data?.total ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Metric</th>
                <th className="p-3">Attempted / cap</th>
                <th className="p-3">Resource</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {(quota.data?.list ?? []).map((hit) => (
                <tr className="border-b last:border-0" key={hit.id}>
                  <td className="p-3">{hit.metric}</td>
                  <td className="p-3">
                    {hit.attempted} / {hit.cap}
                  </td>
                  <td className="p-3">{hit.resource ?? '—'}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(hit.createdTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
