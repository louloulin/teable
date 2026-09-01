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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useState } from 'react';

type FederationStatus = 'active' | 'paused' | 'broken' | 'draft';
type FederationRefreshMode = 'event' | 'interval' | 'manual';

interface IFederationView {
  id: string;
  orgId: string;
  name: string;
  description: string;
  status: FederationStatus;
  refreshMode: FederationRefreshMode;
  refreshIntervalSeconds: number;
  lastRefreshedBy: string | null;
  lastRefreshedAt: string | null;
  lastStalenessSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

interface IFederationSource {
  id: string;
  baseId: string;
  kind: 'table' | 'view';
  targetId: string;
  alias: string;
  fields: string[] | null;
  filter: string | null;
}

const STATUS_COLORS: Record<FederationStatus, string> = {
  active: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  broken: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-800',
};
const MODES: FederationRefreshMode[] = ['event', 'interval', 'manual'];

export const CrossBaseFederationPanel = () => {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('');
  const [viewId, setViewId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [refreshMode, setRefreshMode] = useState<FederationRefreshMode>('event');
  const [intervalSec, setIntervalSec] = useState('300');
  const [baseId, setBaseId] = useState('');
  const [sourceKind, setSourceKind] = useState<'table' | 'view'>('table');
  const [targetId, setTargetId] = useState('');
  const [alias, setAlias] = useState('');

  const views = useQuery({
    queryKey: ['admin', 'federation', 'views', orgId],
    queryFn: () =>
      axios
        .get<{ views: IFederationView[] }>(`/api/cross-base-federation/orgs/${orgId}/views`)
        .then(({ data }) => data.views),
    enabled: !!orgId,
  });

  const sources = useQuery({
    queryKey: ['admin', 'federation', 'sources', viewId],
    queryFn: () =>
      axios
        .get<{ sources: IFederationSource[] }>(`/api/cross-base-federation/views/${viewId}/sources`)
        .then(({ data }) => data.sources),
    enabled: !!viewId,
  });

  const createView = useMutation({
    mutationFn: () =>
      axios
        .put<IFederationView>(`/api/cross-base-federation/views/${viewId || 'temp'}`, {
          id: viewId || 'temp',
          orgId,
          name,
          description,
          refreshMode,
          refreshIntervalSeconds: Number(intervalSec),
        })
        .then(({ data }) => data),
    onSuccess: () => {
      toast.success('Federation view created');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'federation'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addSource = useMutation({
    mutationFn: () =>
      axios
        .put<IFederationSource>(
          `/api/cross-base-federation/views/${viewId}/sources/${alias || 'temp'}`,
          {
            id: alias || 'temp',
            baseId,
            kind: sourceKind,
            targetId,
            alias,
          }
        )
        .then(({ data }) => data),
    onSuccess: () => {
      toast.success('Source added');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'federation'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const refresh = useMutation({
    mutationFn: () =>
      axios
        .post<IFederationView>(`/api/cross-base-federation/views/${viewId}/refresh`, {
          triggeredBy: 'admin',
        })
        .then(({ data }) => data),
    onSuccess: () => {
      toast.success('Refresh started');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'federation'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Cross-base Federation</CardTitle>
          <CardDescription>
            Cloud §跨 base 联邦 — read-only views that join data from multiple bases across an org.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Org ID</Label>
              <Input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="org_xxx" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>View ID (new or existing)</Label>
              <Input value={viewId} onChange={(e) => setViewId(e.target.value)} placeholder="fed_xxx" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales dashboard" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Refresh mode</Label>
              <Select value={refreshMode} onValueChange={(v) => setRefreshMode(v as FederationRefreshMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Interval (seconds)</Label>
              <Input
                value={intervalSec}
                onChange={(e) => setIntervalSec(e.target.value)}
                type="number"
              />
            </div>
          </div>
          <Button
            onClick={() => createView.mutate()}
            disabled={!orgId || !viewId || !name || createView.isPending}
          >
            {createView.isPending ? 'Saving…' : 'Upsert view'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sources</CardTitle>
          <CardDescription>Add a table/view source to the selected federation view.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Base ID</Label>
              <Input value={baseId} onChange={(e) => setBaseId(e.target.value)} placeholder="bse_xxx" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Kind</Label>
              <Select value={sourceKind} onValueChange={(v) => setSourceKind(v as 'table' | 'view')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="table">table</SelectItem>
                  <SelectItem value="view">view</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Target ID</Label>
              <Input
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="tbl_xxx / viw_xxx"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Alias</Label>
              <Input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="sales" />
            </div>
          </div>
          <Button
            onClick={() => addSource.mutate()}
            disabled={!viewId || !baseId || !targetId || addSource.isPending}
          >
            {addSource.isPending ? 'Adding…' : 'Add source'}
          </Button>
          {sources.data?.length ? (
            <div className="flex flex-col gap-2">
              {sources.data.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <span className="font-medium">{s.alias}</span> · {s.kind}:{' '}
                    <span className="font-mono">{s.targetId}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">base {s.baseId}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Views</CardTitle>
          <CardDescription>Federation views in the selected org.</CardDescription>
        </CardHeader>
        <CardContent>
          {!orgId ? (
            <p className="text-sm text-muted-foreground">Enter an org ID to list federation views.</p>
          ) : views.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : views.data?.length ? (
            <div className="flex flex-col gap-2">
              {views.data.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_COLORS[v.status]}>{v.status}</Badge>
                      <span className="font-medium">{v.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {v.id} · {v.refreshMode}
                      {v.refreshMode === 'interval' ? ` (${v.refreshIntervalSeconds}s)` : ''} ·{' '}
                      {v.lastStalenessSeconds !== null
                        ? `staleness ${v.lastStalenessSeconds}s`
                        : 'never refreshed'}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setViewId(v.id);
                      refresh.mutate();
                    }}
                    disabled={refresh.isPending}
                  >
                    Refresh
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No federation views found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
