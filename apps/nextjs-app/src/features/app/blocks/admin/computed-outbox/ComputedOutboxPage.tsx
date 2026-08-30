import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getAdminComputedOutboxOverview,
  listAdminComputedOutboxAnomalies,
  recoverAdminComputedOutboxAnomaly,
} from '@teable/openapi';
import { Button, Skeleton } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';

const statusClass: Record<string, string> = {
  healthy: 'text-green-600',
  degraded: 'text-yellow-600',
  critical: 'text-red-600',
};

export const ComputedOutboxPage = () => {
  const queryClient = useQueryClient();
  const overview = useQuery({
    queryKey: ['admin', 'computed-outbox', 'overview'],
    queryFn: () => getAdminComputedOutboxOverview().then(({ data }) => data),
    refetchInterval: 15_000,
  });
  const anomalies = useQuery({
    queryKey: ['admin', 'computed-outbox', 'anomalies'],
    queryFn: () => listAdminComputedOutboxAnomalies().then(({ data }) => data),
    refetchInterval: 15_000,
  });
  const recover = useMutation({
    mutationFn: recoverAdminComputedOutboxAnomaly,
    onSuccess: () => {
      toast.success('Computed task recovery requested');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'computed-outbox'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (overview.isLoading || anomalies.isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-8">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const error = overview.error ?? anomalies.error;
  if (error)
    return (
      <div className="flex flex-1 p-8 text-sm text-destructive">
        {error instanceof Error ? error.message : 'Unable to load computed outbox'}
      </div>
    );

  const snapshot = overview.data;
  return (
    <div className="flex h-screen flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Computed Outbox</h1>
        <p
          className={`text-sm font-medium capitalize ${statusClass[snapshot?.status ?? 'critical'] ?? 'text-red-600'}`}
        >
          {snapshot?.status ?? 'unknown'}
          {snapshot?.reasons?.length ? ` — ${snapshot.reasons.join(', ')}` : ''}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Waiting', snapshot?.queue.waiting],
          ['Active', snapshot?.queue.active],
          ['Delayed', snapshot?.queue.delayed],
          ['Failed', snapshot?.queue.failed],
          ['Pending', snapshot?.outbox.duePending],
          ['Dead', snapshot?.outbox.dead],
        ].map(([label, value]) => (
          <div className="rounded-lg border bg-card p-4" key={String(label)}>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold">{value ?? 0}</div>
          </div>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Anomalies ({anomalies.data?.total ?? 0})</h2>
        {(anomalies.data?.groups ?? []).length === 0 ? (
          <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            No computed outbox anomalies.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Kind</th>
                  <th className="p-3">Base</th>
                  <th className="p-3">Count</th>
                  <th className="p-3">Last error</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.data?.groups.map((group) => {
                  const item = group.items[0];
                  return (
                    <tr className="border-b last:border-0" key={group.groupKey}>
                      <td className="p-3">{group.kind}</td>
                      <td className="p-3">{group.baseId}</td>
                      <td className="p-3">{group.count}</td>
                      <td className="max-w-md truncate p-3 text-muted-foreground">
                        {group.lastError ?? '—'}
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!item || recover.isPending}
                          onClick={() =>
                            item &&
                            void recover.mutate({
                              targetId: group.targetId,
                              taskId: item.taskId,
                              kind: group.kind === 'stale' ? 'stale' : 'dead',
                            })
                          }
                        >
                          Recover
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
