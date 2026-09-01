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

type SnapshotStatus = 'pending' | 'complete' | 'failed';
type MergeMode = 'merge' | 'replace';

interface ISnapshotRow {
  id: string;
  baseId: string;
  createdBy: string;
  status: SnapshotStatus;
  sizeBytes: number;
  archivePath: string;
  manifest: { totalRecords: number; tables: Array<{ name: string; recordCount: number }> } | null;
  errorMessage: string | null;
  createdTime: string;
}

interface IRestoreLogRow {
  id: string;
  snapshotId: string;
  targetBaseId: string;
  status: 'queued' | 'running' | 'complete' | 'failed';
  rowsRestored: number;
  errorMessage: string | null;
}

const STATUS_COLORS: Record<SnapshotStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  complete: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

export const BackupPanel = () => {
  const queryClient = useQueryClient();
  const [baseId, setBaseId] = useState('');
  const [targetBaseId, setTargetBaseId] = useState('');
  const [mode, setMode] = useState<MergeMode>('merge');
  const [selectedSnapshot, setSelectedSnapshot] = useState('');

  const snapshots = useQuery({
    queryKey: ['admin', 'backup', baseId],
    queryFn: () =>
      axios
        .get<{ snapshots: ISnapshotRow[] }>(`/api/backup`, {
          params: { baseId, actor: 'admin' },
        })
        .then(({ data }) => data.snapshots),
    enabled: !!baseId,
  });

  const create = useMutation({
    mutationFn: () =>
      axios
        .post<ISnapshotRow>(`/api/backup`, {
          baseId,
          createdBy: 'admin',
          actor: { admin: true },
        })
        .then(({ data }) => data),
    onSuccess: () => {
      toast.success('Backup snapshot created');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'backup'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      axios.delete(`/api/backup/${id}`, { params: { actor: 'admin' } }),
    onSuccess: () => {
      toast.success('Snapshot deleted');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'backup'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restore = useMutation({
    mutationFn: () =>
      axios
        .post<IRestoreLogRow>(`/api/backup/restore`, {
          snapshotId: selectedSnapshot,
          targetBaseId,
          mode,
          actor: { admin: true },
        })
        .then(({ data }) => data),
    onSuccess: () => {
      toast.success('Restore started');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'backup'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Backup & Restore</CardTitle>
          <CardDescription>
            Cloud §备份管理 — create base snapshots, list them, and restore to a target base.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Base ID</Label>
            <Input
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              placeholder="bse_xxx"
            />
          </div>
          <Button onClick={() => create.mutate()} disabled={!baseId || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create snapshot'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Snapshots</CardTitle>
          <CardDescription>Snapshots for the selected base.</CardDescription>
        </CardHeader>
        <CardContent>
          {!baseId ? (
            <p className="text-sm text-muted-foreground">Enter a base ID to list snapshots.</p>
          ) : snapshots.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : snapshots.data?.length ? (
            <div className="flex flex-col gap-2">
              {snapshots.data.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_COLORS[s.status]}>{s.status}</Badge>
                      <span className="font-mono text-xs">{s.id}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {s.manifest
                        ? `${s.manifest.totalRecords} records · ${s.manifest.tables.length} tables`
                        : `${s.sizeBytes} bytes`}{' '}
                      · {new Date(s.createdTime).toLocaleString()}
                    </div>
                    {s.errorMessage && (
                      <div className="text-xs text-red-600">{s.errorMessage}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedSnapshot(s.id)}
                    >
                      Select
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(s.id)}
                      disabled={remove.isPending}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No snapshots found.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Restore</CardTitle>
          <CardDescription>Restore a snapshot into a target base.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Snapshot ID</Label>
            <Input
              value={selectedSnapshot}
              onChange={(e) => setSelectedSnapshot(e.target.value)}
              placeholder="snap_xxx"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Target base ID</Label>
              <Input
                value={targetBaseId}
                onChange={(e) => setTargetBaseId(e.target.value)}
                placeholder="bse_xxx"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as MergeMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">merge</SelectItem>
                  <SelectItem value="replace">replace</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => restore.mutate()}
            disabled={!selectedSnapshot || !targetBaseId || restore.isPending}
          >
            {restore.isPending ? 'Restoring…' : 'Start restore'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
