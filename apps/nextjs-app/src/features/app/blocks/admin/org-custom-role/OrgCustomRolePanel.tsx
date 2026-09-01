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
import { toast } from "@teable/ui-lib/shadcn/ui/sonner";
import { useState } from 'react';

type CustomRoleCapability =
  | 'base.read'
  | 'base.write'
  | 'base.delete'
  | 'field.create'
  | 'field.update'
  | 'field.delete'
  | 'row.create'
  | 'row.update'
  | 'row.delete'
  | 'view.create'
  | 'view.update'
  | 'view.delete'
  | 'automation.run'
  | 'automation.edit'
  | 'share.create'
  | 'invite.user'
  | 'webhook.manage'
  | 'api-token.manage';

interface ICustomRole {
  id: string;
  orgId: string;
  name: string;
  description: string;
  capabilities: CustomRoleCapability[];
  scopes: Array<{ kind: string; resourceId: string; filter?: string }>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface IRoleAssignment {
  id: string;
  orgId: string;
  userId: string;
  roleId: string;
  baseId: string | null;
  grantedAt: string;
  grantedBy: string;
}

const ALL_CAPABILITIES: CustomRoleCapability[] = [
  'base.read',
  'base.write',
  'base.delete',
  'field.create',
  'field.update',
  'field.delete',
  'row.create',
  'row.update',
  'row.delete',
  'view.create',
  'view.update',
  'view.delete',
  'automation.run',
  'automation.edit',
  'share.create',
  'invite.user',
  'webhook.manage',
  'api-token.manage',
];

export const OrgCustomRolePanel = () => {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('');
  const [roleId, setRoleId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [capabilities, setCapabilities] = useState<CustomRoleCapability[]>([]);
  const [userId, setUserId] = useState('');
  const [baseId, setBaseId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');
  const [assignUserId, setAssignUserId] = useState('');

  const roles = useQuery({
    queryKey: ['admin', 'org-custom-role', orgId],
    queryFn: () =>
      axios
        .get<{ roles: ICustomRole[] }>(`/api/org-custom-role/orgs/${orgId}/roles`)
        .then(({ data }) => data.roles),
    enabled: !!orgId,
  });

  const assignments = useQuery({
    queryKey: ['admin', 'org-custom-role', 'assignments', orgId, assignUserId],
    queryFn: () =>
      axios
        .get<{ assignments: IRoleAssignment[] }>(
          `/api/org-custom-role/orgs/${orgId}/users/${assignUserId}/assignments`
        )
        .then(({ data }) => data.assignments),
    enabled: !!orgId && !!assignUserId,
  });

  const upsert = useMutation({
    mutationFn: () =>
      axios
        .put<ICustomRole>(`/api/org-custom-role/roles/${roleId || 'temp'}`, {
          id: roleId || 'temp',
          orgId,
          name,
          description,
          capabilities,
          scopes: [],
          enabled,
        })
        .then(({ data }) => data),
    onSuccess: () => {
      toast.success('Custom role saved');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'org-custom-role'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/org-custom-role/roles/${id}`),
    onSuccess: () => {
      toast.success('Role deleted');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'org-custom-role'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const assign = useMutation({
    mutationFn: () =>
      axios
        .put<IRoleAssignment>(`/api/org-custom-role/assignments/${assignUserId}-${assignRoleId}`, {
          id: `${assignUserId}-${assignRoleId}`,
          orgId,
          userId: assignUserId,
          roleId: assignRoleId,
          baseId: baseId || null,
          grantedBy: 'admin',
        })
        .then(({ data }) => data),
    onSuccess: () => {
      toast.success('Role assigned');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'org-custom-role'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unassign = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/org-custom-role/assignments/${id}`),
    onSuccess: () => {
      toast.success('Assignment removed');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'org-custom-role'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Org Custom Roles</CardTitle>
          <CardDescription>
            Cloud §组织自定义角色 — define per-org custom roles with capability lists and assign
            them to users.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Org ID</Label>
              <Input value={orgId} onChange={(e) => setOrgId(e.target.value)} placeholder="org_xxx" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Role ID (new or existing)</Label>
              <Input value={roleId} onChange={(e) => setRoleId(e.target.value)} placeholder="rol_xxx" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales manager" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Enabled</Label>
              <Select value={enabled ? 'true' : 'false'} onValueChange={(v) => setEnabled(v === 'true')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">enabled</SelectItem>
                  <SelectItem value="false">disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Capabilities (click to toggle)</Label>
            <div className="flex flex-wrap gap-2">
              {ALL_CAPABILITIES.map((cap) => {
                const active = capabilities.includes(cap);
                return (
                  <Button
                    key={cap}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    onClick={() =>
                      setCapabilities((current) =>
                        active ? current.filter((c) => c !== cap) : [...current, cap]
                      )
                    }
                  >
                    {cap}
                  </Button>
                );
              })}
            </div>
          </div>
          <Button
            onClick={() => upsert.mutate()}
            disabled={!orgId || !roleId || !name || upsert.isPending}
          >
            {upsert.isPending ? 'Saving…' : 'Upsert role'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Roles</CardTitle>
          <CardDescription>Custom roles for the selected org.</CardDescription>
        </CardHeader>
        <CardContent>
          {!orgId ? (
            <p className="text-sm text-muted-foreground">Enter an org ID to list roles.</p>
          ) : roles.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : roles.data?.length ? (
            <div className="flex flex-col gap-2">
              {roles.data.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={r.enabled ? 'default' : 'secondary'}>
                        {r.enabled ? 'enabled' : 'disabled'}
                      </Badge>
                      <span className="font-medium">{r.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.id} · {r.capabilities.length} capabilities
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(r.id)}
                    disabled={remove.isPending}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No roles found.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Assign Role</CardTitle>
          <CardDescription>Assign a custom role to a user (optionally scoped to a base).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <Label>User ID</Label>
              <Input
                value={assignUserId}
                onChange={(e) => setAssignUserId(e.target.value)}
                placeholder="usr_xxx"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Role ID</Label>
              <Input
                value={assignRoleId}
                onChange={(e) => setAssignRoleId(e.target.value)}
                placeholder="rol_xxx"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Base ID (optional)</Label>
              <Input
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                placeholder="bse_xxx"
              />
            </div>
          </div>
          <Button
            onClick={() => assign.mutate()}
            disabled={!orgId || !assignUserId || !assignRoleId || assign.isPending}
          >
            {assign.isPending ? 'Assigning…' : 'Assign role'}
          </Button>
          {assignments.data?.length ? (
            <div className="flex flex-col gap-2">
              {assignments.data.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <div className="font-mono text-sm">{a.roleId}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.baseId ? `base ${a.baseId}` : 'org-wide'} ·{' '}
                      {new Date(a.grantedAt).toLocaleString()}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => unassign.mutate(a.id)}
                    disabled={unassign.isPending}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};
