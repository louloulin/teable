import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listAdminDataDb,
  retestAdminDataDb,
  updateAdminDataDb,
  type IDataDbConnectionSummaryVo,
} from '@teable/openapi';
import { Button, Skeleton } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';

const formatDate = (value?: string) => (value ? new Date(value).toLocaleString() : '—');

const statusLabel = (summary?: IDataDbConnectionSummaryVo) => {
  if (!summary) return 'Unavailable';
  return `${summary.mode} / ${summary.state}`;
};

export const AdminDataDbPage = () => {
  const queryClient = useQueryClient();
  const dataDbs = useQuery({
    queryKey: ['admin', 'data-db', 'spaces'],
    queryFn: () => listAdminDataDb({ take: 1000 }).then(({ data }) => data),
  });
  const retest = useMutation({
    mutationFn: retestAdminDataDb,
    onSuccess: () => {
      toast.success('Database connection retested');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'data-db', 'spaces'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: ({ spaceId, url }: { spaceId: string; url: string }) =>
      updateAdminDataDb(spaceId, { url }),
    onSuccess: () => {
      toast.success('Database binding updated');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'data-db', 'spaces'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (dataDbs.isLoading) {
    return (
      <div className="flex h-screen flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (dataDbs.error) {
    return (
      <div className="flex h-screen flex-1 items-start p-4 text-sm text-destructive sm:p-8">
        {dataDbs.error instanceof Error ? dataDbs.error.message : 'Unable to load data databases'}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Data databases</h1>
        <p className="text-sm text-muted-foreground">
          Inspect and maintain each space&apos;s default or BYODB data database. Credentials are
          never returned by the API.
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Space</th>
              <th className="p-3">Binding</th>
              <th className="p-3">Host</th>
              <th className="p-3">Database</th>
              <th className="p-3">Schema</th>
              <th className="p-3">Last validated</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(dataDbs.data?.list ?? []).map((space) => {
              const summary = space.dataDb;
              return (
                <tr className="border-b last:border-0" key={space.id}>
                  <td className="p-3">
                    <div className="font-medium">{space.name}</div>
                    <div className="text-xs text-muted-foreground">{space.id}</div>
                  </td>
                  <td className="p-3">{statusLabel(summary)}</td>
                  <td className="p-3">{summary?.displayHost ?? '—'}</td>
                  <td className="p-3">{summary?.displayDatabase ?? '—'}</td>
                  <td className="p-3">{summary?.internalSchema ?? '—'}</td>
                  <td className="p-3 text-muted-foreground">
                    {formatDate(summary?.lastValidatedAt)}
                  </td>
                  <td className="flex flex-wrap gap-2 p-3">
                    {summary?.mode === 'byodb' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retest.isPending}
                          onClick={() => void retest.mutate(space.id)}
                        >
                          Retest
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={update.isPending}
                          onClick={() => {
                            const url = window.prompt(
                              'Enter the replacement PostgreSQL URL. It will not be displayed again.'
                            );
                            if (url?.trim())
                              void update.mutate({ spaceId: space.id, url: url.trim() });
                          }}
                        >
                          Update credentials
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
