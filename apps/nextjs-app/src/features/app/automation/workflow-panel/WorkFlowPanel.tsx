import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
import { useBaseId } from '@teable/sdk/hooks';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@teable/ui-lib';
import { ChevronRight, Clock3, Code2, KeyRound, Play, Wand2 } from 'lucide-react';
import { useRouter } from 'next/router';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { useBaseNodeId } from '../../hooks/useBaseResource';

export interface WorkFlowPanelRef {
  getWorkflow?: () => unknown | undefined;
  checkCanActive?: () => { canActive: boolean; message: string };
  activeWorkflow?: () => Promise<void>;
}

interface WorkFlowPanelProps {
  baseId: string;
  workflowId: string;
  headLeft?: React.ReactNode;
}

type Automation = {
  id: string;
  baseId: string;
  name: string;
  description?: string | null;
  enabled: boolean;
  draftVersion: number;
  liveVersion: number;
  hasDraft: boolean;
  draft: Draft | null;
  triggers: Trigger[];
  actions: Action[];
};

type Draft = {
  name?: string;
  description?: string | null;
  enabled?: boolean;
  triggers: Trigger[];
  actions: Action[];
};

type Trigger = {
  id?: string;
  type: string;
  tableId?: string | null;
  config?: Record<string, unknown>;
};
type Action = {
  id?: string;
  type: string;
  orderIndex?: number;
  config?: Record<string, unknown>;
};
type Run = {
  id: string;
  status: string;
  triggerType: string;
  error?: string | null;
  retryCount?: number;
  createdTime: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  output?: Record<string, unknown> | null;
};

const getDraft = (automation?: Automation): Draft | null => {
  if (!automation) return null;
  return (
    automation.draft ?? {
      name: automation.name,
      description: automation.description,
      enabled: automation.enabled,
      triggers: automation.triggers,
      actions: automation.actions,
    }
  );
};

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleString() : '—');

const AutomationEditor = forwardRef<WorkFlowPanelRef, WorkFlowPanelProps>(
  ({ baseId: propBaseId, workflowId: propWorkflowId }, ref) => {
    const hookBaseId = useBaseId();
    const hookWorkflowId = useBaseNodeId();
    const baseId = propBaseId || hookBaseId || '';
    const routeWorkflowId = propWorkflowId || hookWorkflowId || '';
    const router = useRouter();
    const queryClient = useQueryClient();
    const [prompt, setPrompt] = useState(
      'When a new record is created, run a script and keep the result in the run history.'
    );
    const [offlineDraft, setOfflineDraft] = useState(false);
    const [draftText, setDraftText] = useState('');
    const [secretName, setSecretName] = useState('');
    const [secretValue, setSecretValue] = useState('');
    const [notice, setNotice] = useState<string | null>(null);
    const [selectedRun, setSelectedRun] = useState<Run | null>(null);

    const detailQuery = useQuery({
      queryKey: ['automation', routeWorkflowId],
      queryFn: () =>
        axios.get<Automation>(`/automation/${routeWorkflowId}`).then((res) => res.data),
      enabled: Boolean(routeWorkflowId),
    });
    const listQuery = useQuery({
      queryKey: ['automations', baseId],
      queryFn: () =>
        axios
          .get<{ automations: Automation[] }>(`/automation?baseId=${encodeURIComponent(baseId)}`)
          .then((res) => res.data.automations),
      enabled: Boolean(baseId) && !routeWorkflowId,
    });
    const runsQuery = useQuery({
      queryKey: ['automation-runs', routeWorkflowId],
      queryFn: () =>
        axios
          .get<{ runs: Run[] }>(`/automation/${routeWorkflowId}/runs?take=50`)
          .then((res) => res.data.runs),
      enabled: Boolean(routeWorkflowId),
    });
    const secretsQuery = useQuery({
      queryKey: ['automation-secrets', routeWorkflowId],
      queryFn: () =>
        axios
          .get<{
            secrets: { name: string; maskedValue: string }[];
          }>(`/automation/${routeWorkflowId}/secrets`)
          .then((res) => res.data.secrets),
      enabled: Boolean(routeWorkflowId),
    });

    const automation = detailQuery.data;
    const currentDraft = useMemo(() => getDraft(automation), [automation]);
    const displayedDraft = draftText || (currentDraft ? JSON.stringify(currentDraft, null, 2) : '');

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ['automation', routeWorkflowId] });
      void queryClient.invalidateQueries({ queryKey: ['automations', baseId] });
      void queryClient.invalidateQueries({ queryKey: ['automation-runs', routeWorkflowId] });
      void queryClient.invalidateQueries({ queryKey: ['automation-secrets', routeWorkflowId] });
    };

    const aiMutation = useMutation({
      mutationFn: () =>
        axios
          .post<{ automationId: string; draft: Draft }>('/automation/ai-draft', {
            baseId,
            prompt,
            automationId: routeWorkflowId || undefined,
            offline: offlineDraft,
          })
          .then((res) => res.data),
      onSuccess: (result) => {
        setNotice(
          `Draft generated (${offlineDraft ? 'offline' : 'AI'}). Review it before publishing.`
        );
        if (!routeWorkflowId && result.automationId) {
          void router.push(`/base/${baseId}/automation/${result.automationId}`);
        }
        refresh();
      },
      onError: (error) =>
        setNotice(error instanceof Error ? error.message : 'Unable to generate draft'),
    });

    const saveMutation = useMutation({
      mutationFn: (value: Draft) => axios.patch(`/automation/${routeWorkflowId}`, value),
      onSuccess: () => {
        setDraftText('');
        setNotice('Draft saved. The live workflow is unchanged until Apply update.');
        refresh();
      },
      onError: (error) =>
        setNotice(error instanceof Error ? error.message : 'Unable to save draft'),
    });

    const applyMutation = useMutation({
      mutationFn: () => axios.post(`/automation/${routeWorkflowId}/apply-update`, {}),
      onSuccess: () => {
        setNotice('Draft applied to the live workflow.');
        refresh();
      },
      onError: (error) =>
        setNotice(error instanceof Error ? error.message : 'Unable to apply update'),
    });

    const runMutation = useMutation({
      mutationFn: () =>
        axios.post<{ runId: string; status: string }>('/automation/run', {
          automationId: routeWorkflowId,
          input: { triggerType: 'button_clicked', payload: { source: 'workflow-panel', baseId } },
        }),
      onSuccess: () => {
        setNotice('Test run completed and was added to run history.');
        refresh();
      },
      onError: (error) => setNotice(error instanceof Error ? error.message : 'Test run failed'),
    });

    const secretMutation = useMutation({
      mutationFn: () =>
        axios.put(`/automation/${routeWorkflowId}/secrets/${encodeURIComponent(secretName)}`, {
          value: secretValue,
        }),
      onSuccess: () => {
        setSecretName('');
        setSecretValue('');
        setNotice('Secret saved. The value is never returned by the API.');
        refresh();
      },
      onError: (error) =>
        setNotice(error instanceof Error ? error.message : 'Unable to save secret'),
    });

    const diagnoseMutation = useMutation({
      mutationFn: (runId: string) =>
        axios.get(`/automation/run/${runId}/diagnose`).then((res) => res.data),
      onSuccess: (diagnosis) =>
        setNotice(
          `Diagnosis: ${diagnosis.recommendation}${diagnosis.reason ? ` — ${diagnosis.reason}` : ''}`
        ),
    });
    const rerunMutation = useMutation({
      mutationFn: ({ runId, mode }: { runId: string; mode: 'full' | 'resume' }) =>
        axios.post(`/automation/run/${runId}/rerun`, { mode }),
      onSuccess: () => {
        setNotice('Retry accepted.');
        refresh();
      },
    });

    useImperativeHandle(
      ref,
      () => ({
        getWorkflow: () => automation,
        checkCanActive: () => ({
          canActive: Boolean(
            automation && (automation.triggers.length > 0 || currentDraft?.triggers.length)
          ),
          message: 'Add at least one trigger before enabling the workflow.',
        }),
        activeWorkflow: async () => {
          if (!automation || !currentDraft) return;
          await saveMutation.mutateAsync({ ...currentDraft, enabled: true });
          await applyMutation.mutateAsync();
        },
      }),
      [automation, currentDraft, saveMutation, applyMutation]
    );

    const saveDraft = () => {
      try {
        const parsed = JSON.parse(displayedDraft) as Draft;
        if (!Array.isArray(parsed.triggers) || !Array.isArray(parsed.actions))
          throw new Error('Draft must contain triggers and actions arrays');
        saveMutation.mutate(parsed);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Draft JSON is invalid');
      }
    };

    if (!routeWorkflowId) {
      return (
        <div className="flex h-full flex-col gap-4 overflow-auto p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Automations</h2>
              <p className="text-sm text-muted-foreground">
                Build, test and publish workflows for this base.
              </p>
            </div>
            <Badge variant="outline">{listQuery.data?.length ?? 0} workflows</Badge>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="size-4" /> Build with AI
              </CardTitle>
              <CardDescription>
                Describe the trigger and actions. The generated workflow starts as a disabled draft.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the automation you need"
              />
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => aiMutation.mutate()}
                  disabled={aiMutation.isPending || !prompt.trim()}
                >
                  <Wand2 className="mr-2 size-4" />
                  {aiMutation.isPending ? 'Generating…' : 'Generate draft'}
                </Button>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={offlineDraft} onCheckedChange={setOfflineDraft} />
                  Offline deterministic draft
                </label>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-3 md:grid-cols-2">
            {listQuery.data?.map((item) => (
              <button
                key={item.id}
                className="rounded-lg border p-4 text-left transition hover:border-primary"
                onClick={() => router.push(`/base/${baseId}/automation/${item.id}`)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.name}</span>
                  <Badge variant={item.enabled ? 'default' : 'secondary'}>
                    {item.enabled ? 'Live' : 'Disabled'}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{item.id}</p>
                <ChevronRight className="mt-2 size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        </div>
      );
    }

    if (detailQuery.isLoading || !automation)
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading automation…
        </div>
      );

    return (
      <div className="flex h-full flex-col overflow-auto p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{automation.name}</h2>
            <p className="text-sm text-muted-foreground">
              Live v{automation.liveVersion} ·{' '}
              {automation.hasDraft ? `Draft v${automation.draftVersion}` : 'No pending draft'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={automation.enabled ? 'default' : 'secondary'}>
              {automation.enabled ? 'Live' : 'Disabled'}
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/base/${baseId}/automation`)}
            >
              All workflows
            </Button>
          </div>
        </div>
        <Tabs defaultValue="builder" className="min-h-0 flex-1">
          <TabsList>
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="history">Run history</TabsTrigger>
            <TabsTrigger value="secrets">Secrets</TabsTrigger>
          </TabsList>
          <TabsContent value="builder" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code2 className="size-4" /> Workflow draft
                </CardTitle>
                <CardDescription>
                  Make changes in the draft, test it, then apply the update to the live workflow.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Label htmlFor="automation-draft">JSON configuration</Label>
                <Textarea
                  id="automation-draft"
                  className="min-h-[280px] font-mono text-xs"
                  value={displayedDraft}
                  onChange={(event) => setDraftText(event.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={saveDraft} disabled={saveMutation.isPending}>
                    Save draft
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => applyMutation.mutate()}
                    disabled={!automation.hasDraft || applyMutation.isPending}
                  >
                    Apply update
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => runMutation.mutate()}
                    disabled={runMutation.isPending}
                  >
                    <Play className="mr-2 size-4" />
                    Test
                  </Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Execution model</CardTitle>
                <CardDescription>
                  Trigger types and actions are validated by the backend. Sensitive values must use{' '}
                  {'{{secrets.NAME}}'}.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Triggers</Label>
                  {automation.triggers.map((trigger, index) => (
                    <div
                      className="mt-2 rounded border p-2 text-sm"
                      key={`${trigger.type}-${index}`}
                    >
                      {trigger.type}
                      <span className="block text-xs text-muted-foreground">
                        {trigger.tableId || 'global trigger'}
                      </span>
                    </div>
                  ))}
                </div>
                <div>
                  <Label>Actions</Label>
                  {automation.actions.map((action, index) => (
                    <div
                      className="mt-2 rounded border p-2 text-sm"
                      key={`${action.type}-${index}`}
                    >
                      {index + 1}. {action.type}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          </TabsContent>
          <TabsContent value="history" className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Inspect status, duration and per-step output.
              </p>
              <Button variant="outline" size="sm" onClick={() => runsQuery.refetch()}>
                Refresh
              </Button>
            </div>
            {runsQuery.data?.length ? (
              runsQuery.data.map((run) => (
                <button
                  key={run.id}
                  className="w-full rounded-lg border p-3 text-left hover:border-primary"
                  onClick={() => setSelectedRun(run)}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm">
                      <Clock3 className="size-4" />
                      {formatDate(run.createdTime)}
                    </span>
                    <Badge
                      variant={
                        run.status === 'succeeded'
                          ? 'default'
                          : run.status === 'failed'
                            ? 'destructive'
                            : 'secondary'
                      }
                    >
                      {run.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {run.triggerType} · retry {run.retryCount ?? 0}
                  </p>
                  {run.error && <p className="mt-2 text-xs text-destructive">{run.error}</p>}
                </button>
              ))
            ) : (
              <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
                No runs yet. Use Test to execute the live workflow.
              </div>
            )}
            {selectedRun && (
              <Card>
                <CardHeader>
                  <CardTitle>Run details</CardTitle>
                  <CardDescription>
                    {selectedRun.id} · started {formatDate(selectedRun.startedAt)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(selectedRun.output ?? selectedRun, null, 2)}
                  </pre>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => diagnoseMutation.mutate(selectedRun.id)}
                    >
                      Diagnose
                    </Button>
                    {selectedRun.status === 'failed' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            rerunMutation.mutate({ runId: selectedRun.id, mode: 'full' })
                          }
                        >
                          Full rerun
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            rerunMutation.mutate({ runId: selectedRun.id, mode: 'resume' })
                          }
                        >
                          Resume from failed step
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
          <TabsContent value="secrets">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="size-4" /> Secrets
                </CardTitle>
                <CardDescription>
                  Values are write-only and scoped to this automation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {secretsQuery.data?.map((secret) => (
                  <div className="flex items-center gap-2 text-sm" key={secret.name}>
                    <Badge variant="outline">{secret.name}</Badge>
                    <span className="text-muted-foreground">{secret.maskedValue}</span>
                  </div>
                ))}
                <div className="grid gap-2 md:grid-cols-2">
                  <Input
                    placeholder="SECRET_NAME"
                    value={secretName}
                    onChange={(event) => setSecretName(event.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Secret value"
                    value={secretValue}
                    onChange={(event) => setSecretValue(event.target.value)}
                  />
                </div>
                <Button
                  onClick={() => secretMutation.mutate()}
                  disabled={!secretName.trim() || !secretValue || secretMutation.isPending}
                >
                  Save secret
                </Button>
                {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }
);

AutomationEditor.displayName = 'AutomationEditor';

const WorkFlowPanel = forwardRef<WorkFlowPanelRef, WorkFlowPanelProps>((props, ref) => (
  <AutomationEditor {...props} ref={ref} />
));
WorkFlowPanel.displayName = 'WorkFlowPanel';

export { WorkFlowPanel };
