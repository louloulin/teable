import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getSandboxAgentConfig,
  listSandboxAgentSessions,
  terminateSandboxAgentSession,
  updateSandboxAgentConfig,
} from '@teable/openapi';
import type { ISandboxConfig } from '@teable/openapi';
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useEffect, useState } from 'react';

const DEFAULT_FORM: ISandboxConfig = {
  streamIdleTimeoutSec: 120,
  idleTimeoutSec: 1800,
  concurrentChatLimit: 4,
  vcpus: 2,
  memoryMb: 4096,
  temporaryDiskMb: 10240,
  thinkingEffort: 'medium',
};

const formatError = (error: string | null): string => {
  if (!error) return 'Operational';
  if (error === 'runtime-not-configured') return 'Runtime plane not configured';
  if (error.startsWith('runtime-http-')) return `Runtime HTTP ${error.slice('runtime-http-'.length)}`;
  return error;
};

export const SandboxAgentPanel = () => {
  const queryClient = useQueryClient();
  const config = useQuery({
    queryKey: ['admin', 'sandbox-agent', 'config'],
    queryFn: () => getSandboxAgentConfig().then(({ data }) => data),
  });
  const sessions = useQuery({
    queryKey: ['admin', 'sandbox-agent', 'sessions'],
    queryFn: () => listSandboxAgentSessions().then(({ data }) => data),
    refetchInterval: 5000,
  });
  const [form, setForm] = useState<ISandboxConfig>(DEFAULT_FORM);

  useEffect(() => {
    if (config.data?.settings) {
      setForm({ ...DEFAULT_FORM, ...config.data.settings });
    }
  }, [config.data]);

  const save = useMutation({
    mutationFn: (input: ISandboxConfig) => updateSandboxAgentConfig(input).then(({ data }) => data),
    onSuccess: ({ settings }) => {
      setForm({ ...DEFAULT_FORM, ...settings });
      toast.success('Sandbox Agent settings saved');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'sandbox-agent'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const terminate = useMutation({
    mutationFn: (id: string) => terminateSandboxAgentSession(id),
    onSuccess: () => {
      toast.success('Sandbox session terminated');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'sandbox-agent'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runtime = sessions.data?.runtime ?? config.data?.runtime;
  const setField = <K extends keyof ISandboxConfig>(key: K, value: ISandboxConfig[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const isDirty = Boolean(
    config.data && JSON.stringify({ ...DEFAULT_FORM, ...config.data.settings }) !== JSON.stringify(form)
  );

  return (
    <div className="flex h-screen flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Sandbox Agent</h1>
        <p className="text-sm text-muted-foreground">
          Configure AI Chat sandbox limits and manage live sandbox sessions from the runtime plane.
        </p>
      </div>
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium">Runtime plane</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {runtime?.configured
            ? `Endpoint: ${runtime.provider ?? 'unset'}`
            : 'Set TEABLE_INFRA_API_URL and TEABLE_INFRA_API_KEY to enable Sandbox Agent.'}
        </p>
        <p className="mt-1 text-xs">
          Status: {runtime?.configured ? formatError(runtime.error) : 'Not configured'}
        </p>
      </section>
      {config.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <section className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Stream idle timeout (sec)</Label>
            <Input
              type="number"
              min={1}
              max={3600}
              value={form.streamIdleTimeoutSec}
              onChange={(event) => setField('streamIdleTimeoutSec', Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Idle timeout (sec)</Label>
            <Input
              type="number"
              min={1}
              max={86400}
              value={form.idleTimeoutSec}
              onChange={(event) => setField('idleTimeoutSec', Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Concurrent chat limit</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={form.concurrentChatLimit}
              onChange={(event) => setField('concurrentChatLimit', Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>vCPUs</Label>
            <Input
              type="number"
              min={1}
              max={64}
              value={form.vcpus}
              onChange={(event) => setField('vcpus', Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Memory (MB)</Label>
            <Input
              type="number"
              min={128}
              max={262144}
              value={form.memoryMb}
              onChange={(event) => setField('memoryMb', Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Temporary disk (MB)</Label>
            <Input
              type="number"
              min={128}
              max={1048576}
              value={form.temporaryDiskMb}
              onChange={(event) => setField('temporaryDiskMb', Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Thinking effort</Label>
            <Select
              value={form.thinkingEffort}
              onValueChange={(value) => setField('thinkingEffort', value as ISandboxConfig['thinkingEffort'])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button disabled={!isDirty || save.isPending} onClick={() => save.mutate(form)}>
              Save settings
            </Button>
          </div>
        </section>
      )}
      <section className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="text-sm font-medium">Active sandboxes ({sessions.data?.sessions.length ?? 0})</h2>
          <p className="text-xs text-muted-foreground">
            Sessions are loaded from the runtime plane; list auto-refreshes every five seconds.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Sandbox</th>
                <th className="p-3">Status</th>
                <th className="p-3">Started</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.isLoading ? (
                <tr>
                  <td colSpan={4} className="p-4 text-xs text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : sessions.data?.sessions.length ? (
                sessions.data.sessions.map((session) => {
                  const id = String(session.id ?? '');
                  const status = String(session.status ?? 'unknown');
                  const started = session.createdAt
                    ? new Date(String(session.createdAt)).toLocaleString()
                    : '—';
                  return (
                    <tr className="border-t" key={id}>
                      <td className="p-3 font-mono text-xs">{id}</td>
                      <td className="p-3">{status}</td>
                      <td className="p-3 text-xs text-muted-foreground">{started}</td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={terminate.isPending || !runtime?.configured}
                          onClick={() => {
                            if (window.confirm(`Terminate sandbox ${id}?`)) {
                              terminate.mutate(id);
                            }
                          }}
                        >
                          Terminate
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={4} className="p-4 text-xs text-muted-foreground">
                    {runtime?.configured ? 'No active sandboxes.' : 'Runtime plane not configured.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
