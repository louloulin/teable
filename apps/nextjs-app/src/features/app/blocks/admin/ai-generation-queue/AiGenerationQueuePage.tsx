import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelAdminAiGenerationTask,
  getAdminAiGenerationQueueOverview,
} from '@teable/openapi';
import { Button, Skeleton } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';

export const AiGenerationQueuePage = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'ai-generation-queue', 'overview'],
    queryFn: () => getAdminAiGenerationQueueOverview().then(({ data }) => data),
    refetchInterval: 15_000,
  });
  const cancelTask = useMutation({
    mutationFn: (taskId: string) => cancelAdminAiGenerationTask(taskId),
    onSuccess: () => {
      toast.success('Cancellation requested');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ai-generation-queue', 'overview'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (query.isLoading) return <Skeleton className="m-8 h-48 flex-1" />;
  if (query.error) {
    return (
      <div className="flex-1 p-8 text-sm text-destructive">
        Unable to load AI generation diagnostics.
      </div>
    );
  }
  const data = query.data;
  return (
    <div className="flex h-screen flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">AI generation queue</h1>
        <p className="text-sm text-muted-foreground">
          Persistent AI field tasks, configuration, and run history from this instance.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Object.entries(data?.summary.tasks ?? {}).map(([label, value]) => (
          <div className="rounded-lg border bg-card p-4" key={label}>
            <div className="text-xs capitalize text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Recent tasks ({data?.tasks.length ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Task</th>
                <th className="p-3">Scope</th>
                <th className="p-3">Progress</th>
                <th className="p-3">Status</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.tasks ?? []).map((task) => {
                const status = String(task.status ?? '—');
                const canCancel = status === 'waiting' || status === 'processing';
                return (
                  <tr className="border-b last:border-0" key={String(task.id)}>
                    <td className="p-3 font-mono text-xs">{String(task.id)}</td>
                    <td className="p-3">{String(task.tableId ?? '—')}</td>
                    <td className="p-3">
                      {String(task.completedCount ?? 0)} / {String(task.totalCount ?? 0)}
                    </td>
                    <td className="p-3">{status}</td>
                    <td className="p-3">
                      {canCancel ? (
                        <Button
                          disabled={cancelTask.isPending}
                          onClick={() => cancelTask.mutate(String(task.id))}
                          size="sm"
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        {data?.queue.reason}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Configured fields', data?.summary.configuredFields],
          ['Enabled fields', data?.summary.enabledFields],
          ['Error fields', data?.summary.errorFields],
          ['Last hour runs', data?.summary.lastHourRuns],
          ['Last hour failures', data?.summary.byStatus.failed],
        ].map(([label, value]) => (
          <div className="rounded-lg border bg-card p-4" key={String(label)}>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold">{value ?? 0}</div>
          </div>
        ))}
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Configured AI fields ({data?.fields.length ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Field</th>
                <th className="p-3">Operation</th>
                <th className="p-3">Model</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last error</th>
              </tr>
            </thead>
            <tbody>
              {(data?.fields ?? []).map((field) => (
                <tr className="border-b last:border-0" key={String(field.id)}>
                  <td className="p-3">{String(field.fieldId ?? '—')}</td>
                  <td className="p-3">{String(field.operation ?? '—')}</td>
                  <td className="p-3">{String(field.model ?? '—')}</td>
                  <td className="p-3">{String(field.status ?? '—')}</td>
                  <td className="max-w-md truncate p-3 text-muted-foreground">
                    {String(field.lastErrorMessage ?? '—')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
