import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
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
  Skeleton,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useState } from 'react';

type ConflictKind = 'optimistic-lock' | 'duplicate-write' | 'stale-read' | 'incompatible-version';

interface IConflictEvent {
  id: string;
  orgId: string;
  recordId: string;
  kind: ConflictKind;
  idempotencyKey: string;
  offset: number;
  attempts: number;
  lastError?: string;
  enqueuedAt: string;
  lastAttemptAt?: string;
}

const KIND_COLORS: Record<ConflictKind, string> = {
  'optimistic-lock': 'bg-blue-100 text-blue-800',
  'duplicate-write': 'bg-yellow-100 text-yellow-800',
  'stale-read': 'bg-purple-100 text-purple-800',
  'incompatible-version': 'bg-red-100 text-red-800',
};

export const ConflictReplayPanel = () => {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('');

  const queue = useQuery({
    queryKey: ['admin', 'conflict-replay', orgId],
    queryFn: () =>
      axios
        .get<{ events: IConflictEvent[] }>(`/api/conflict-replay/orgs/${orgId}/queue`)
        .then(({ data }) => data.events),
    enabled: !!orgId,
    refetchInterval: 5000,
  });

  const drain = useMutation({
    mutationFn: () =>
      axios
        .post<{ drained: number }>(`/api/conflict-replay/orgs/${orgId}/drain`)
        .then(({ data }) => data),
    onSuccess: (data) => {
      toast.success(`Drained ${data.drained} events`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'conflict-replay'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/conflict-replay/orgs/${orgId}/events/${id}`),
    onSuccess: () => {
      toast.success('Event removed');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'conflict-replay'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Conflict Replay</CardTitle>
          <CardDescription>
            Cloud §冲突重放 — inspect and drain the conflict replay queue for an organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Organization ID</Label>
            <Input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="org_xxx" />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => drain.mutate()} disabled={!orgId || drain.isPending}>
              {drain.isPending ? 'Draining…' : 'Drain queue'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Queue</CardTitle>
          <CardDescription>Pending conflict events (auto-refreshes every 5s).</CardDescription>
        </CardHeader>
        <CardContent>
          {!orgId ? (
            <p className="text-sm text-muted-foreground">Enter an org ID to inspect the queue.</p>
          ) : queue.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : queue.data?.length ? (
            <div className="flex flex-col gap-2">
              {queue.data.map((e) => (
                <div key={e.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className={KIND_COLORS[e.kind]}>{e.kind}</Badge>
                      <span className="font-mono text-xs">{e.id}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      record <span className="font-mono">{e.recordId}</span> · offset {e.offset} ·
                      attempts {e.attempts} · {new Date(e.enqueuedAt).toLocaleString()}
                    </div>
                    {e.lastError && <div className="text-xs text-red-600">{e.lastError}</div>}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(e.id)}
                    disabled={remove.isPending}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Queue is empty.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
