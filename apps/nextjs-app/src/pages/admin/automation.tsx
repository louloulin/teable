import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@teable/ui-lib/shadcn';
import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

interface IAutomationOverview {
  summary: {
    activeWorkflows: number;
    totalRuns: number;
    succeededRuns: number;
    failedRuns: number;
    successRate: number | null;
    averageDurationMs: number | null;
  };
  healthOverview: { healthy: number; warning: number; critical: number };
  statusDistribution: Record<string, number>;
  automations: Array<{
    id: string;
    baseId: string;
    name: string;
    enabled: boolean;
    runCount: number;
    failedRuns: number;
    lastRun: string | null;
    averageDurationMs: number | null;
    health: 'healthy' | 'warning' | 'critical' | 'inactive';
  }>;
  recentRuns: Array<{
    id: string;
    automationName: string;
    triggerType: string;
    status: string;
    error: string | null;
    createdTime: string;
    startedAt?: string | null;
    finishedAt?: string | null;
  }>;
}

const timeRanges = [
  { label: 'Last 30 minutes', value: '0.5' },
  { label: 'Last hour', value: '1' },
  { label: 'Last 6 hours', value: '6' },
  { label: 'Last 24 hours', value: '24' },
  { label: 'Last 3 days', value: '72' },
  { label: 'Last 7 days', value: '168' },
  { label: 'Last 30 days', value: '720' },
] as const;

const triggerTypes = [
  'all',
  'record_created',
  'record_updated',
  'record_deleted',
  'record_matches_conditions',
  'schedule',
  'button_clicked',
  'form_submitted',
  'webhook_received',
  'email_received',
] as const;

const runStatuses = [
  'all',
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'canceled',
] as const;

const AutomationAdminPage: NextPageWithLayout = () => {
  const [hours, setHours] = useState('24');
  const [triggerType, setTriggerType] = useState<(typeof triggerTypes)[number]>('all');
  const [status, setStatus] = useState<(typeof runStatuses)[number]>('all');
  const [selectedAutomationId, setSelectedAutomationId] = useState<string>();
  const queryClient = useQueryClient();
  const deactivateMutation = useMutation({
    mutationFn: (automationId: string) =>
      axios.patch(`/admin/automation/${automationId}/deactivate`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-automation-overview'] });
    },
  });
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-automation-overview', hours, triggerType, status],
    queryFn: () =>
      axios
        .get<IAutomationOverview>('/admin/automation/overview', {
          params: {
            hours,
            ...(triggerType === 'all' ? {} : { triggerType }),
            ...(status === 'all' ? {} : { status }),
          },
        })
        .then((response) => response.data),
  });
  const { data: selectedRuns } = useQuery({
    queryKey: ['admin-automation-runs', selectedAutomationId, status],
    enabled: Boolean(selectedAutomationId),
    queryFn: () =>
      axios
        .get<{
          runs: IAutomationOverview['recentRuns'];
        }>(`/admin/automation/${selectedAutomationId}/runs`, {
          params: status === 'all' ? {} : { status },
        })
        .then((response) => response.data),
  });
  const summary = data?.summary;

  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">Automation management</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review instance-wide workflow health and recent automation runs.
        </p>
      </div>
      <div className="mb-6 flex flex-wrap gap-3">
        <Select value={hours} onValueChange={setHours}>
          <SelectTrigger className="w-44" aria-label="Time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timeRanges.map((range) => (
              <SelectItem key={range.value} value={range.value}>
                {range.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={triggerType}
          onValueChange={(value) => setTriggerType(value as typeof triggerType)}
        >
          <SelectTrigger className="w-56" aria-label="Trigger filter">
            <SelectValue placeholder="All triggers" />
          </SelectTrigger>
          <SelectContent>
            {triggerTypes.map((value) => (
              <SelectItem key={value} value={value}>
                {value === 'all' ? 'All triggers' : value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => setStatus(value as typeof status)}>
          <SelectTrigger className="w-44" aria-label="Run status filter">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            {runStatuses.map((value) => (
              <SelectItem key={value} value={value}>
                {value === 'all' ? 'All statuses' : value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading automation status…</p>}
      {isError && <p className="text-sm text-destructive">Unable to load automation status.</p>}
      {summary && (
        <div className="grid gap-4 md:grid-cols-5">
          {[
            ['Active workflows', summary.activeWorkflows],
            ['Total runs', summary.totalRuns],
            [
              'Success rate',
              summary.successRate === null ? '—' : `${Math.round(summary.successRate * 100)}%`,
            ],
            ['Failed runs', summary.failedRuns],
            [
              'Average duration',
              summary.averageDurationMs === null ? '—' : `${summary.averageDurationMs} ms`,
            ],
          ].map(([label, value]) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              </CardHeader>
              <CardContent className="text-2xl font-semibold">{value}</CardContent>
            </Card>
          ))}
        </div>
      )}
      {data && (
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle>Health overview</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Badge variant="default">Healthy: {data.healthOverview.healthy}</Badge>
              <Badge variant="secondary">Warning: {data.healthOverview.warning}</Badge>
              <Badge variant="destructive">Critical: {data.healthOverview.critical}</Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Automations</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Name</th>
                    <th className="p-2">Runs</th>
                    <th className="p-2">Failures</th>
                    <th className="p-2">Avg duration</th>
                    <th className="p-2">Health</th>
                    <th className="p-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.automations.map((automation) => (
                    <tr
                      key={automation.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-muted/50"
                      onClick={() =>
                        setSelectedAutomationId((current) =>
                          current === automation.id ? undefined : automation.id
                        )
                      }
                    >
                      <td className="p-2">{automation.name}</td>
                      <td className="p-2">{automation.runCount}</td>
                      <td className="p-2">{automation.failedRuns}</td>
                      <td className="p-2">
                        {automation.averageDurationMs === null
                          ? '—'
                          : `${automation.averageDurationMs} ms`}
                      </td>
                      <td className="p-2">
                        <Badge
                          variant={
                            automation.health === 'critical'
                              ? 'destructive'
                              : automation.health === 'healthy'
                                ? 'default'
                                : 'secondary'
                          }
                        >
                          {automation.health}
                        </Badge>
                      </td>
                      <td className="p-2">
                        {automation.enabled && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(event) => {
                              event.stopPropagation();
                              deactivateMutation.mutate(automation.id);
                            }}
                            disabled={deactivateMutation.isPending}
                          >
                            Deactivate
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selectedAutomationId && selectedRuns && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="mb-2 font-medium">Selected automation run history</h3>
                  <div className="space-y-2 text-sm">
                    {selectedRuns.runs.length === 0 && (
                      <p className="text-muted-foreground">No runs match the selected filters.</p>
                    )}
                    {selectedRuns.runs.map((run) => (
                      <div key={run.id} className="flex flex-wrap gap-3 rounded border p-2">
                        <Badge variant="secondary">{run.status}</Badge>
                        <span>{run.triggerType}</span>
                        <span>{new Date(run.createdTime).toLocaleString()}</span>
                        {run.startedAt && run.finishedAt && (
                          <span>
                            {new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()}{' '}
                            ms
                          </span>
                        )}
                        {run.error && <span className="text-destructive">{run.error}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent runs</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="p-2">Automation</th>
                    <th className="p-2">Trigger</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentRuns.slice(0, 20).map((run) => (
                    <tr key={run.id} className="border-b last:border-0">
                      <td className="p-2">{run.automationName}</td>
                      <td className="p-2">{run.triggerType}</td>
                      <td className="p-2">{run.status}</td>
                      <td className="whitespace-nowrap p-2">
                        {new Date(run.createdTime).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = withEnv(
  ensureLogin(
    withAuthSSR(async (context, ssrApi) => {
      const userMe = await ssrApi.getUserMe();
      if (!userMe?.isAdmin) throw new ForbiddenError();
      return { props: { ...(await getTranslationsProps(context, 'common')) } };
    })
  )
);

AutomationAdminPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default AutomationAdminPage;
