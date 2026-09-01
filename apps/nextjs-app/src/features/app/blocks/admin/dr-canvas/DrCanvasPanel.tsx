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

interface DrCanvasSpec {
  id: string;
  name: string;
  version: 1;
  nodes: Array<{
    id: string;
    kind: string;
    ref: string;
    label: string;
    position: { x: number; y: number };
    config?: Record<string, unknown>;
  }>;
  edges: Array<{ id: string; from: string; to: string }>;
  target: { source: string; destination: string };
}

interface DrValidationResult {
  ok: boolean;
  issues: Array<{ code: string; target?: string; message: string }>;
}

interface DrExecutionPlan {
  canvasId: string;
  steps: Array<{ index: number; nodeId: string; kind: string; ref: string }>;
  linear: boolean;
  checkpointCount: number;
}

export const DrCanvasPanel = () => {
  const queryClient = useQueryClient();
  const [baseId, setBaseId] = useState('');
  const [canvasId, setCanvasId] = useState('');
  const [canvasName, setCanvasName] = useState('');
  const [canvasJson, setCanvasJson] = useState(
    JSON.stringify(
      {
        id: 'dr_default',
        name: 'Sample DR canvas',
        version: 1,
        nodes: [
          { id: 'snap', kind: 'snapshot', ref: 'bse_xxx', label: 'Snapshot', position: { x: 0, y: 0 } },
          { id: 'repl', kind: 'replicate', ref: 'bse_yyy', label: 'Replicate', position: { x: 1, y: 0 } },
          { id: 'rest', kind: 'restore', ref: 'bse_yyy', label: 'Restore', position: { x: 2, y: 0 } },
        ],
        edges: [
          { id: 'e1', from: 'snap', to: 'repl' },
          { id: 'e2', from: 'repl', to: 'rest' },
        ],
        target: { source: 'us', destination: 'eu' },
      },
      null,
      2
    )
  );

  const canvases = useQuery({
    queryKey: ['admin', 'dr-canvas', baseId],
    queryFn: () =>
      axios
        .get<{ canvases: DrCanvasSpec[] }>(`/api/dr-canvas/bases/${baseId}/canvases`)
        .then(({ data }) => data.canvases),
    enabled: !!baseId,
  });

  const validation = useQuery({
    queryKey: ['admin', 'dr-canvas', 'validate', canvasId],
    queryFn: () =>
      axios
        .post<DrValidationResult>(`/api/dr-canvas/canvases/${canvasId}/validate`, {})
        .then(({ data }) => data),
    enabled: false,
  });

  const plan = useQuery({
    queryKey: ['admin', 'dr-canvas', 'plan', canvasId],
    queryFn: () =>
      axios.post<DrExecutionPlan>(`/api/dr-canvas/canvases/${canvasId}/plan`, {}).then(({ data }) => data),
    enabled: false,
  });

  const upsert = useMutation({
    mutationFn: () => {
      const parsed = JSON.parse(canvasJson) as DrCanvasSpec;
      return axios
        .put<DrCanvasSpec>(`/api/dr-canvas/canvases/${parsed.id}`, parsed)
        .then(({ data }) => data);
    },
    onSuccess: () => {
      toast.success('DR canvas saved');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dr-canvas'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/dr-canvas/canvases/${id}`),
    onSuccess: () => {
      toast.success('Canvas deleted');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dr-canvas'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>DR Canvas</CardTitle>
          <CardDescription>
            Cloud §灾难恢复画布 — define a directed acyclic graph of snapshot/replicate/restore
            nodes and validate + plan it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Base ID</Label>
              <Input value={baseId} onChange={(e) => setBaseId(e.target.value)} placeholder="bse_xxx" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Canvas name (new)</Label>
              <Input value={canvasName} onChange={(e) => setCanvasName(e.target.value)} placeholder="Daily DR" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Canvas JSON</Label>
            <textarea
              value={canvasJson}
              onChange={(e) => setCanvasJson(e.target.value)}
              className="min-h-[200px] rounded border p-2 font-mono text-xs"
            />
          </div>
          <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
            {upsert.isPending ? 'Saving…' : 'Save canvas'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Validate / Plan</CardTitle>
          <CardDescription>Validate the canvas structure and emit an execution plan.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Canvas ID</Label>
            <Input value={canvasId} onChange={(e) => setCanvasId(e.target.value)} placeholder="dr_xxx" />
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => validation.refetch()}
              disabled={!canvasId}
            >
              Validate
            </Button>
            <Button variant="outline" onClick={() => plan.refetch()} disabled={!canvasId}>
              Plan
            </Button>
          </div>
          {validation.data && (
            <div className="rounded border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={validation.data.ok ? 'default' : 'destructive'}>
                  {validation.data.ok ? 'valid' : 'invalid'}
                </Badge>
                {validation.data.issues.length} issues
              </div>
              {validation.data.issues.map((issue, i) => (
                <div key={i} className="mt-1 text-xs text-red-600">
                  [{issue.code}] {issue.message}
                </div>
              ))}
            </div>
          )}
          {plan.data && (
            <div className="rounded border p-3 text-sm">
              <div className="font-medium">Execution plan</div>
              <div className="text-xs text-muted-foreground">
                {plan.data.steps.length} steps · {plan.data.checkpointCount} checkpoints · linear:{' '}
                {String(plan.data.linear)}
              </div>
              <div className="mt-2 flex flex-col gap-1">
                {plan.data.steps.map((s) => (
                  <div key={s.index} className="text-xs">
                    {s.index}. {s.kind} <span className="font-mono">{s.ref}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Canvases</CardTitle>
          <CardDescription>DR canvases for the selected base.</CardDescription>
        </CardHeader>
        <CardContent>
          {!baseId ? (
            <p className="text-sm text-muted-foreground">Enter a base ID to list canvases.</p>
          ) : canvases.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : canvases.data?.length ? (
            <div className="flex flex-col gap-2">
              {canvases.data.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.id} · {c.nodes.length} nodes · {c.edges.length} edges · {c.target.source} →{' '}
                      {c.target.destination}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCanvasId(c.id)}
                    >
                      Select
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(c.id)}
                      disabled={remove.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No canvases found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
