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

type RegionStatus = 'active' | 'draining' | 'offline';
type RegionCode = 'us' | 'eu' | 'ap' | 'sa' | 'af' | 'ca';

interface IRegion {
  id: string;
  code: string;
  displayName: string;
  status: RegionStatus;
  dataCenterLocation: string | null;
}

interface IDataResidencyPolicy {
  id: string;
  organizationId: string;
  regionCode: string;
  locked: boolean;
  updatedBy: string;
  updatedTime: string;
}

const REGION_CODES: RegionCode[] = ['us', 'eu', 'ap', 'sa', 'af', 'ca'];
const STATUS_COLORS: Record<RegionStatus, string> = {
  active: 'bg-green-100 text-green-800',
  draining: 'bg-yellow-100 text-yellow-800',
  offline: 'bg-red-100 text-red-800',
};

export const DataResidencyPanel = () => {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('');
  const [regionCode, setRegionCode] = useState<RegionCode>('us');
  const [locked, setLocked] = useState(false);

  const regions = useQuery({
    queryKey: ['admin', 'data-residency', 'regions'],
    queryFn: () => axios.get<{ regions: IRegion[] }>(`/api/data-residency/regions`).then(({ data }) => data.regions),
  });

  const policy = useQuery({
    queryKey: ['admin', 'data-residency', 'policy', orgId],
    queryFn: () =>
      axios
        .get<{ policy: IDataResidencyPolicy | null }>(`/api/data-residency/policies/${orgId}`)
        .then(({ data }) => data.policy),
    enabled: !!orgId,
  });

  const setPolicy = useMutation({
    mutationFn: () =>
      axios
        .put<IDataResidencyPolicy>(`/api/data-residency/policies/${orgId}`, {
          organizationId: orgId,
          regionCode,
          locked,
          updatedBy: 'admin',
        })
        .then(({ data }) => data),
    onSuccess: () => {
      toast.success('Residency policy saved');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'data-residency'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removePolicy = useMutation({
    mutationFn: () => axios.delete(`/api/data-residency/policies/${orgId}`),
    onSuccess: () => {
      toast.success('Residency policy removed');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'data-residency'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Data Residency</CardTitle>
          <CardDescription>
            Cloud §数据驻留 — pin an organization to a region; cross-region reads are gated by
            policy.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label>Organization ID</Label>
            <Input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="org_xxx" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Region</Label>
              <Select value={regionCode} onValueChange={(v) => setRegionCode(v as RegionCode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REGION_CODES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Locked</Label>
              <Select value={locked ? 'true' : 'false'} onValueChange={(v) => setLocked(v === 'true')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="false">unlocked</SelectItem>
                  <SelectItem value="true">locked</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setPolicy.mutate()} disabled={!orgId || setPolicy.isPending}>
              {setPolicy.isPending ? 'Saving…' : 'Save policy'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => removePolicy.mutate()}
              disabled={!orgId || removePolicy.isPending}
            >
              Remove policy
            </Button>
          </div>
          {policy.data && (
            <div className="rounded border p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={policy.data.locked ? 'destructive' : 'default'}>
                  {policy.data.locked ? 'locked' : 'unlocked'}
                </Badge>
                <span>
                  {policy.data.organizationId} → <span className="font-mono">{policy.data.regionCode}</span>
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                updated by {policy.data.updatedBy} at {new Date(policy.data.updatedTime).toLocaleString()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regions</CardTitle>
          <CardDescription>Available regions and their status.</CardDescription>
        </CardHeader>
        <CardContent>
          {regions.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : regions.data?.length ? (
            <div className="flex flex-col gap-2">
              {regions.data.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <div className="font-medium">{r.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{r.code}</span>
                      {r.dataCenterLocation ? ` · ${r.dataCenterLocation}` : ''}
                    </div>
                  </div>
                  <Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No regions found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
