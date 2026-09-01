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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useState } from 'react';
import { AuthorityMatrixPanel } from './AuthorityMatrixPanel';

type ViewPermissionLevel = 'read' | 'write' | 'owner' | 'denied';
type ViewSubjectKind = 'user' | 'role';

interface IViewPermissionRow {
  id: string;
  viewId: string;
  subjectKind: ViewSubjectKind;
  subjectId: string;
  permission: ViewPermissionLevel;
  createdTime: string;
}

const PERMISSIONS: ViewPermissionLevel[] = ['read', 'write', 'owner', 'denied'];
const PERM_COLORS: Record<ViewPermissionLevel, string> = {
  read: 'bg-blue-100 text-blue-800',
  write: 'bg-green-100 text-green-800',
  owner: 'bg-purple-100 text-purple-800',
  denied: 'bg-red-100 text-red-800',
};

export const ViewPermissionPanel = () => {
  const queryClient = useQueryClient();
  const [viewId, setViewId] = useState('');
  const [caller, setCaller] = useState('');
  const [viewCreatorId, setViewCreatorId] = useState('');
  const [subjectKind, setSubjectKind] = useState<ViewSubjectKind>('user');
  const [subjectId, setSubjectId] = useState('');
  const [permission, setPermission] = useState<ViewPermissionLevel>('read');

  const rows = useQuery({
    queryKey: ['admin', 'view-permission', viewId],
    queryFn: () =>
      axios
        .get<{ rows: IViewPermissionRow[] }>(`/api/view/${viewId}/permission`, {
          params: { caller, viewCreatorId },
        })
        .then(({ data }) => data.rows),
    enabled: !!viewId && !!caller && !!viewCreatorId,
  });

  const grant = useMutation({
    mutationFn: () =>
      axios
        .post<IViewPermissionRow>(`/api/view/${viewId}/permission`, {
          subjectKind,
          subjectId,
          permission,
        }, { params: { caller, viewCreatorId } })
        .then(({ data }) => data),
    onSuccess: () => {
      toast.success('View permission granted');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'view-permission'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: (row: IViewPermissionRow) =>
      axios.delete(`/api/view/${viewId}/permission`, {
        params: { caller, viewCreatorId, subjectKind: row.subjectKind, subjectId: row.subjectId },
      }),
    onSuccess: () => {
      toast.success('View permission revoked');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'view-permission'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-6" data-testid="view-permission-root">
      <Tabs defaultValue="authority" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="authority" className="text-xs" data-testid="view-permission-tab-authority">
            Authority Matrix
          </TabsTrigger>
          <TabsTrigger value="acl" className="text-xs" data-testid="view-permission-tab-acl">
            View ACL
          </TabsTrigger>
        </TabsList>
        <TabsContent value="authority">
          <AuthorityMatrixPanel />
        </TabsContent>
        <TabsContent value="acl">
      <Card>
        <CardHeader>
          <CardTitle>View Permission</CardTitle>
          <CardDescription>
            Cloud §视图权限 — grant or deny read/write/owner access on a specific view.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <Label>View ID</Label>
              <Input value={viewId} onChange={(e) => setViewId(e.target.value)} placeholder="viw_xxx" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Caller user ID</Label>
              <Input value={caller} onChange={(e) => setCaller(e.target.value)} placeholder="usr_xxx" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>View creator ID</Label>
              <Input
                value={viewCreatorId}
                onChange={(e) => setViewCreatorId(e.target.value)}
                placeholder="usr_xxx"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Subject kind</Label>
              <Select value={subjectKind} onValueChange={(v) => setSubjectKind(v as ViewSubjectKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">user</SelectItem>
                  <SelectItem value="role">role</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <Label>Subject ID</Label>
              <Input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="usr_xxx / rol_xxx" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Permission</Label>
              <Select value={permission} onValueChange={(v) => setPermission(v as ViewPermissionLevel)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERMISSIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => grant.mutate()}
            disabled={!viewId || !caller || !viewCreatorId || !subjectId || grant.isPending}
          >
            {grant.isPending ? 'Granting…' : 'Grant permission'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grants</CardTitle>
          <CardDescription>Permission rows for the selected view.</CardDescription>
        </CardHeader>
        <CardContent>
          {!viewId || !caller || !viewCreatorId ? (
            <p className="text-sm text-muted-foreground">
              Enter view ID, caller and view creator to list grants.
            </p>
          ) : rows.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : rows.data?.length ? (
            <div className="flex flex-col gap-2">
              {rows.data.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded border p-3">
                  <div className="flex items-center gap-2">
                    <Badge className={PERM_COLORS[r.permission]}>{r.permission}</Badge>
                    <span className="text-sm">
                      {r.subjectKind}: <span className="font-mono">{r.subjectId}</span>
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke.mutate(r)}
                    disabled={revoke.isPending}
                  >
                    Revoke
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No grants found.</p>
          )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
