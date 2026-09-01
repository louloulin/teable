/**
 * V15 — Authority Matrix (Cloud §权限矩阵) complete configuration UI.
 * Backend endpoints: /api/permission-matrix/...
 *   Roles:        POST|GET /roles, DELETE /roles/:id, PUT /roles/:id/enabled
 *   Field rule:   PUT /roles/:id/field-permission
 *   Row filter:   PUT /roles/:id/record-filter
 *   View access:  PUT|GET /roles/:id/view-access
 *   Members:      POST|DELETE /members
 *   Import/Export:PUT|GET /roles/:id/import-export, DELETE /roles/:id/import-export/:tableId
 *
 * License: AGPL-3.0
 */

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
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { Filter, KeyRound, Lock, Plus, Shield, Trash2, Users, View } from 'lucide-react';
import { useState } from 'react';

/* ─────────── Types ─────────── */

interface IRoleRow {
  id: string;
  baseId: string;
  name: string;
  description?: string | null;
  enabled?: boolean;
  createdTime?: string;
}

type FieldPermissionRule = 'read' | 'write' | 'denied';
interface IFieldPermissionRow {
  tableId: string;
  fieldId: string;
  permission: FieldPermissionRule;
}

interface IRecordFilterRow {
  tableId: string;
  filter: string; // JSON-encoded Prisma where
}

interface IViewAccessRow {
  tableId: string;
  viewId: string;
}

interface IImportExportRow {
  tableId: string;
  permission: 'allow' | 'deny';
}

/* ─────────── helpers ─────────── */

function useBaseId() {
  return useState<string>('');
}

const TableIdInput = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <Input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder || 'tbl_xxx'}
    className="h-8 text-xs font-mono"
  />
);

/* ─────────── Roles Tab ─────────── */

function RolesTab({ baseId }: { baseId: string }) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const roles = useQuery({
    queryKey: ['authority-matrix', 'roles', baseId],
    enabled: Boolean(baseId),
    queryFn: () =>
      axios
        .get<{ roles: IRoleRow[] }>(`/api/permission-matrix/roles`, { params: { baseId } })
        .then((r) => (r.data as unknown as { roles?: IRoleRow[] }).roles ?? []),
  });

  const create = useMutation({
    mutationFn: () =>
      axios.post(`/api/permission-matrix/roles`, {
        baseId,
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Role created');
      setNewName('');
      setNewDesc('');
      void queryClient.invalidateQueries({ queryKey: ['authority-matrix', 'roles'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (roleId: string) =>
      axios.delete(`/api/permission-matrix/roles/${roleId}`, { params: { baseId } }),
    onSuccess: () => {
      toast.success('Role deleted');
      void queryClient.invalidateQueries({ queryKey: ['authority-matrix', 'roles'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: (r: IRoleRow) =>
      axios.put(`/api/permission-matrix/roles/${r.id}/enabled`, {
        baseId,
        enabled: !r.enabled,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['authority-matrix', 'roles'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Plus className="h-4 w-4" /> New role
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Role name (e.g. Sales Manager)"
            className="h-8 text-sm"
            data-testid="authority-role-name"
          />
          <Input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Description (optional)"
            className="h-8 text-sm"
            data-testid="authority-role-desc"
          />
          <Button
            size="sm"
            disabled={!newName.trim() || create.isPending}
            onClick={() => create.mutate()}
            data-testid="authority-role-create"
          >
            <Plus className="mr-1 h-3 w-3" /> Create role
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Existing roles ({roles.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1" data-testid="authority-roles-list">
          {roles.data?.length === 0 ? (
            <div className="text-xs text-muted-foreground">No roles configured yet.</div>
          ) : (
            roles.data?.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 rounded border bg-card p-2"
                data-testid={`authority-role-${r.id}`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.name}</span>
                    <Badge variant={r.enabled ? 'default' : 'outline'} className="text-[10px]">
                      {r.enabled ? 'enabled' : 'disabled'}
                    </Badge>
                  </div>
                  {r.description && (
                    <div className="text-xs text-muted-foreground">{r.description}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleEnabled.mutate(r)}
                    title={r.enabled ? 'Disable' : 'Enable'}
                  >
                    {r.enabled ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove.mutate(r.id)}
                    title="Delete"
                    data-testid={`authority-role-delete-${r.id}`}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────── Field Permissions Tab ─────────── */

function FieldPermissionsTab({ baseId, roles }: { baseId: string; roles: IRoleRow[] }) {
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? '');
  const [tableId, setTableId] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [permission, setPermission] = useState<FieldPermissionRule>('read');

  const save = useMutation({
    mutationFn: () =>
      axios.put(`/api/permission-matrix/roles/${roleId}/field-permission`, {
        baseId,
        rules: [{ tableId, fieldId, permission }],
      }),
    onSuccess: () => {
      toast.success('Field permission saved');
      void queryClient.invalidateQueries({ queryKey: ['authority-matrix'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Lock className="h-4 w-4" /> Field-level permission
        </CardTitle>
        <CardDescription className="text-xs">
          Restrict which fields each role can read / write / is denied from seeing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label className="text-xs">Role</Label>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger className="h-8 text-xs" data-testid="authority-field-role">
            <SelectValue placeholder="Pick a role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label className="text-xs">Table ID</Label>
        <TableIdInput value={tableId} onChange={setTableId} placeholder="tbl_xxx" />

        <Label className="text-xs">Field ID</Label>
        <Input
          value={fieldId}
          onChange={(e) => setFieldId(e.target.value)}
          placeholder="fld_xxx"
          className="h-8 text-xs font-mono"
          data-testid="authority-field-id"
        />

        <Label className="text-xs">Permission</Label>
        <Select value={permission} onValueChange={(v) => setPermission(v as FieldPermissionRule)}>
          <SelectTrigger className="h-8 text-xs" data-testid="authority-field-perm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="read">read</SelectItem>
            <SelectItem value="write">write</SelectItem>
            <SelectItem value="denied">denied</SelectItem>
          </SelectContent>
        </Select>

        <Button
          size="sm"
          disabled={!roleId || !tableId || !fieldId || save.isPending}
          onClick={() => save.mutate()}
          data-testid="authority-field-save"
        >
          <Lock className="mr-1 h-3 w-3" /> Save field rule
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─────────── Record Filters Tab ─────────── */

function RecordFiltersTab({ baseId, roles }: { baseId: string; roles: IRoleRow[] }) {
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? '');
  const [tableId, setTableId] = useState('');
  const [filterJson, setFilterJson] = useState('{"status":"active"}');

  const save = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(filterJson);
      } catch {
        throw new Error('filter must be valid JSON');
      }
      return axios.put(`/api/permission-matrix/roles/${roleId}/record-filter`, {
        baseId,
        filters: [{ tableId, filter: parsed }],
      });
    },
    onSuccess: () => {
      toast.success('Row filter saved');
      void queryClient.invalidateQueries({ queryKey: ['authority-matrix'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Filter className="h-4 w-4" /> Row-level filter (record-filter)
        </CardTitle>
        <CardDescription className="text-xs">
          Limit which rows each role can see — JSON Prisma where clause.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label className="text-xs">Role</Label>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger className="h-8 text-xs" data-testid="authority-filter-role">
            <SelectValue placeholder="Pick a role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label className="text-xs">Table ID</Label>
        <TableIdInput value={tableId} onChange={setTableId} />

        <Label className="text-xs">Filter (Prisma where JSON)</Label>
        <Textarea
          value={filterJson}
          onChange={(e) => setFilterJson(e.target.value)}
          rows={4}
          className="font-mono text-xs"
          placeholder='{"status": "active"}'
          data-testid="authority-filter-json"
        />

        <Button
          size="sm"
          disabled={!roleId || !tableId || !filterJson.trim() || save.isPending}
          onClick={() => save.mutate()}
          data-testid="authority-filter-save"
        >
          <Filter className="mr-1 h-3 w-3" /> Save row filter
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─────────── View Access Tab ─────────── */

function ViewAccessTab({ baseId, roles }: { baseId: string; roles: IRoleRow[] }) {
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? '');
  const [tableId, setTableId] = useState('');
  const [viewId, setViewId] = useState('');

  const save = useMutation({
    mutationFn: () =>
      axios.put(`/api/permission-matrix/roles/${roleId}/view-access`, {
        baseId,
        views: [{ tableId, viewId }],
      }),
    onSuccess: () => {
      toast.success('View access saved');
      void queryClient.invalidateQueries({ queryKey: ['authority-matrix'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <View className="h-4 w-4" /> View-level access (specific views)
        </CardTitle>
        <CardDescription className="text-xs">
          Restrict which views each role can open. Cloud 'Specific' mode of view-access.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label className="text-xs">Role</Label>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Pick a role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label className="text-xs">Table ID</Label>
        <TableIdInput value={tableId} onChange={setTableId} />

        <Label className="text-xs">View ID</Label>
        <Input
          value={viewId}
          onChange={(e) => setViewId(e.target.value)}
          placeholder="viw_xxx"
          className="h-8 text-xs font-mono"
        />

        <Button
          size="sm"
          disabled={!roleId || !tableId || !viewId || save.isPending}
          onClick={() => save.mutate()}
          data-testid="authority-view-save"
        >
          <View className="mr-1 h-3 w-3" /> Save view access
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─────────── Import/Export Tab ─────────── */

function ImportExportTab({ baseId, roles }: { baseId: string; roles: IRoleRow[] }) {
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState<string>(roles[0]?.id ?? '');
  const [tableId, setTableId] = useState('');
  const [permission, setPermission] = useState<'allow' | 'deny'>('allow');

  const save = useMutation({
    mutationFn: () =>
      axios.put(`/api/permission-matrix/roles/${roleId}/import-export`, {
        baseId,
        entries: [{ tableId, permission }],
      }),
    onSuccess: () => {
      toast.success('Import/export permission saved');
      void queryClient.invalidateQueries({ queryKey: ['authority-matrix'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <KeyRound className="h-4 w-4" /> Import / Export permission
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label className="text-xs">Role</Label>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Pick a role" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Label className="text-xs">Table ID</Label>
        <TableIdInput value={tableId} onChange={setTableId} />

        <Label className="text-xs">Permission</Label>
        <Select value={permission} onValueChange={(v) => setPermission(v as 'allow' | 'deny')}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="allow">allow</SelectItem>
            <SelectItem value="deny">deny</SelectItem>
          </SelectContent>
        </Select>

        <Button size="sm" disabled={!roleId || !tableId || save.isPending} onClick={() => save.mutate()}>
          <KeyRound className="mr-1 h-3 w-3" /> Save import/export
        </Button>
      </CardContent>
    </Card>
  );
}

/* ─────────── Main Authority Matrix Panel ─────────── */

export function AuthorityMatrixPanel({ baseId: baseIdProp }: { baseId?: string }) {
  const [baseId, setBaseId] = useBaseId();
  const effectiveBaseId = baseIdProp ?? baseId;

  const roles = useQuery({
    queryKey: ['authority-matrix', 'roles', effectiveBaseId],
    enabled: Boolean(effectiveBaseId),
    queryFn: () =>
      axios
        .get<{ roles: IRoleRow[] }>(`/api/permission-matrix/roles`, { params: { baseId: effectiveBaseId } })
        .then((r) => (r.data as unknown as { roles?: IRoleRow[] }).roles ?? []),
  });

  if (!baseIdProp) {
    return (
      <div className="space-y-3 p-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" /> Authority Matrix
            </CardTitle>
            <CardDescription className="text-xs">
              Cloud §权限矩阵 — Roles + Field rules + Row filters + View access + Import/Export.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label className="text-xs">Base ID</Label>
            <Input
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              placeholder="bse_xxx"
              className="h-8 text-xs font-mono"
              data-testid="authority-base-id"
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const roleList = (roles.data as unknown as IRoleRow[]) ?? [];

  return (
    <div className="p-3" data-testid="authority-matrix-panel">
      <Tabs defaultValue="roles">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="roles" className="text-xs" data-testid="authority-tab-roles">
            <Users className="mr-1 h-3 w-3" /> Roles
          </TabsTrigger>
          <TabsTrigger value="field" className="text-xs">
            <Lock className="mr-1 h-3 w-3" /> Field
          </TabsTrigger>
          <TabsTrigger value="filter" className="text-xs">
            <Filter className="mr-1 h-3 w-3" /> Filter
          </TabsTrigger>
          <TabsTrigger value="view" className="text-xs">
            <View className="mr-1 h-3 w-3" /> View
          </TabsTrigger>
          <TabsTrigger value="impexp" className="text-xs">
            <KeyRound className="mr-1 h-3 w-3" /> Import
          </TabsTrigger>
        </TabsList>
        <ScrollArea className="mt-3 h-[500px]">
          <TabsContent value="roles">
            <RolesTab baseId={effectiveBaseId} />
          </TabsContent>
          <TabsContent value="field">
            <FieldPermissionsTab baseId={effectiveBaseId} roles={roleList} />
          </TabsContent>
          <TabsContent value="filter">
            <RecordFiltersTab baseId={effectiveBaseId} roles={roleList} />
          </TabsContent>
          <TabsContent value="view">
            <ViewAccessTab baseId={effectiveBaseId} roles={roleList} />
          </TabsContent>
          <TabsContent value="impexp">
            <ImportExportTab baseId={effectiveBaseId} roles={roleList} />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
