import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  acceptAdminTableQueryOpsRecommendation,
  dismissAdminTableQueryOpsRecommendation,
  getAdminTableQueryOpsOverview,
  runAdminTableQueryOpsTask,
} from '@teable/openapi';
import { Button, Skeleton } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';

const cards = [
  ['Requests', 'requestCount'],
  ['Slow', 'slowCount'],
  ['Timeouts', 'timeoutCount'],
  ['DB errors', 'dbErrorCount'],
  ['Open recommendations', 'openRecommendationCount'],
  ['Failed tasks', 'failedTaskCount'],
] as const;

export const TableQueryOpsPage = () => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['admin', 'table-query-ops', 'overview'],
    queryFn: () => getAdminTableQueryOpsOverview({ limit: 25 }).then(({ data }) => data),
    refetchInterval: 15_000,
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin', 'table-query-ops'] });
  const accept = useMutation({
    mutationFn: ({ id, baseId, kind }: { id: string; baseId: string; kind?: string }) =>
      acceptAdminTableQueryOpsRecommendation(id, { baseId, kind }),
    onSuccess: () => {
      toast.success('Recommendation accepted and task queued');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const dismiss = useMutation({
    mutationFn: ({ id, baseId }: { id: string; baseId: string }) =>
      dismissAdminTableQueryOpsRecommendation(id, { baseId }),
    onSuccess: () => {
      toast.success('Recommendation dismissed');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const runTask = useMutation({
    mutationFn: ({ id, baseId }: { id: string; baseId: string }) =>
      runAdminTableQueryOpsTask(id, { baseId, allowManualIndexExecution: true }),
    onSuccess: () => {
      toast.success('Remediation task run requested');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <Skeleton className="m-8 h-48 flex-1" />;
  if (query.error) {
    return (
      <div className="flex-1 p-8 text-sm text-destructive">Unable to load Table Query Ops.</div>
    );
  }
  const data = query.data;
  return (
    <div className="flex h-screen flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Table Query Ops</h1>
        <p className="text-sm text-muted-foreground">
          Query performance observations, recommendations, and remediation tasks.
        </p>
      </div>
      {!data?.enabled ? (
        <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Table Query Ops is not initialized yet. Enable the V2 query operations runtime to begin
          collecting data.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cards.map(([label, key]) => (
              <div className="rounded-lg border bg-card p-4" key={key}>
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-2xl font-semibold">{data.summary?.[key] ?? 0}</div>
              </div>
            ))}
          </div>
          <TableSection title={`Hot tables (${data.hotTables.length})`}>
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Base</th>
                <th className="p-3">Table</th>
                <th className="p-3">Requests</th>
                <th className="p-3">Max duration</th>
              </tr>
            </thead>
            <tbody>
              {data.hotTables.map((table, index) => (
                <tr className="border-b last:border-0" key={`${String(table.table_id)}-${index}`}>
                  <td className="p-3">{String(table.base_id ?? '—')}</td>
                  <td className="p-3">{String(table.table_id ?? '—')}</td>
                  <td className="p-3">{String(table.request_count ?? 0)}</td>
                  <td className="p-3">{String(table.max_duration_ms ?? 0)} ms</td>
                </tr>
              ))}
            </tbody>
          </TableSection>
          <TableSection title={`Recommendations (${data.recommendations.length})`}>
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Table</th>
                <th className="p-3">Risk</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.recommendations.map((recommendation, index) => {
                const id = String(recommendation.id ?? '');
                const baseId = String(recommendation.base_id ?? '');
                return (
                  <tr className="border-b last:border-0" key={`${id}-${index}`}>
                    <td className="p-3">{String(recommendation.table_id ?? '—')}</td>
                    <td className="p-3">
                      {String(recommendation.risk_level ?? '—')} (
                      {String(recommendation.risk_score ?? 0)})
                    </td>
                    <td className="p-3">{String(recommendation.status ?? '—')}</td>
                    <td className="flex gap-2 p-3">
                      <Button
                        size="sm"
                        disabled={!id || accept.isPending}
                        onClick={() => void accept.mutate({ id, baseId })}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!id || dismiss.isPending}
                        onClick={() => void dismiss.mutate({ id, baseId })}
                      >
                        Dismiss
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableSection>
          <TableSection title={`Remediation tasks (${data.tasks.length})`}>
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Task</th>
                <th className="p-3">Table</th>
                <th className="p-3">Kind</th>
                <th className="p-3">Status</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.tasks.map((task, index) => {
                const id = String(task.id ?? '');
                const baseId = String(task.base_id ?? '');
                const status = String(task.status ?? '');
                return (
                  <tr className="border-b last:border-0" key={`${id}-${index}`}>
                    <td className="p-3">{id || '—'}</td>
                    <td className="p-3">{String(task.table_id ?? '—')}</td>
                    <td className="p-3">{String(task.kind ?? '—')}</td>
                    <td className="p-3">{status}</td>
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          !id || !['queued', 'failed'].includes(status) || runTask.isPending
                        }
                        onClick={() => {
                          if (
                            window.confirm(
                              'Run this remediation task? Index changes may alter database write performance.'
                            )
                          ) {
                            void runTask.mutate({ id, baseId });
                          }
                        }}
                      >
                        Run
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </TableSection>
        </>
      )}
    </div>
  );
};

const TableSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h2 className="text-lg font-medium">{title}</h2>
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">{children}</table>
    </div>
  </section>
);
