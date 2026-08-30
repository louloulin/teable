import { useQuery } from '@tanstack/react-query';
import { listAdminQuotaHits, listAdminSpaces, listAdminUsers } from '@teable/openapi';
import { Skeleton } from '@teable/ui-lib/shadcn';

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

export const AdminOperationsPage = () => {
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => listAdminUsers({ take: 100 }).then(({ data }) => data),
  });
  const spaces = useQuery({
    queryKey: ['admin', 'spaces'],
    queryFn: () => listAdminSpaces({ take: 100 }).then(({ data }) => data),
  });
  const quota = useQuery({
    queryKey: ['admin', 'quota-dashboard'],
    queryFn: () => listAdminQuotaHits({ take: 50 }).then(({ data }) => data),
  });

  const loading = users.isLoading || spaces.isLoading || quota.isLoading;
  if (loading) {
    return (
      <div className="flex h-screen flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const error = users.error ?? spaces.error ?? quota.error;
  if (error) {
    return (
      <div className="flex h-screen flex-1 items-start p-4 text-sm text-destructive sm:p-8">
        {error instanceof Error ? error.message : 'Unable to load admin operations'}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-1 flex-col gap-8 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Operations</h1>
        <p className="text-sm text-muted-foreground">
          Instance users, spaces, and quota events available to administrators.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Users ({users.data?.total ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Role</th>
                <th className="p-3">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {(users.data?.list ?? []).map((user) => (
                <tr className="border-b last:border-0" key={user.id}>
                  <td className="p-3">{user.name ?? '—'}</td>
                  <td className="p-3">{user.email}</td>
                  <td className="p-3">{user.isAdmin ? 'Admin' : 'Member'}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(user.lastSignTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Spaces ({spaces.data?.total ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Created by</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {(spaces.data?.list ?? []).map((space) => (
                <tr className="border-b last:border-0" key={space.id}>
                  <td className="p-3">{space.name}</td>
                  <td className="p-3">{space.createdBy}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(space.createdTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
