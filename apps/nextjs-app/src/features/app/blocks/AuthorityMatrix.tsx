import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axios, getTableList } from '@teable/openapi';
import { useBase, useBasePermission } from '@teable/sdk/hooks';
import {
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
  Textarea,
} from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

type PermissionAction = 'view' | 'update' | 'create' | 'delete' | 'comment';
type Role = {
  id: string;
  name: string;
  description: string | null;
  status: 'enabled' | 'disabled';
  members: string[];
  nodes: { tableId: string; access: 'none' | 'editable' }[];
  recordActions: { tableId: string; action: PermissionAction }[];
};

const actionLabels: Record<PermissionAction, string> = {
  view: 'View',
  update: 'Update',
  create: 'Create',
  delete: 'Delete',
  comment: 'Comment',
};

export function AuthorityMatrixPage() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const base = useBase();
  const permission = useBasePermission();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const baseId = String(router.query.baseId ?? base?.id ?? '');
  const canConfigure = Boolean(permission?.['base|authority_matrix_config']);

  const roles = useQuery({
    queryKey: ['permission-matrix', baseId],
    enabled: Boolean(baseId && canConfigure),
    queryFn: () =>
      axios
        .get<Role[]>('/admin/permission-matrix/roles', { params: { baseId } })
        .then(({ data }) => data),
  });
  const tables = useQuery({
    queryKey: ['permission-matrix-tables', baseId],
    enabled: Boolean(baseId && canConfigure),
    queryFn: () => getTableList(baseId).then(({ data }) => data),
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['permission-matrix', baseId] });
  const createRole = useMutation({
    mutationFn: () =>
      axios.post<Role>('/admin/permission-matrix/roles', { baseId, name: name.trim() }),
    onSuccess: () => {
      setName('');
      invalidate();
      toast.success('Role created');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const setEnabled = useMutation({
    mutationFn: ({ roleId, enabled }: { roleId: string; enabled: boolean }) =>
      axios.put(
        `/admin/permission-matrix/roles/${roleId}/enabled`,
        { enabled },
        { params: { baseId } }
      ),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });
  const setTableAccess = useMutation({
    mutationFn: ({
      roleId,
      tableId,
      access,
    }: {
      roleId: string;
      tableId: string;
      access: 'none' | 'editable';
    }) =>
      axios.put(
        `/admin/permission-matrix/roles/${roleId}/table-access`,
        { tableId, access },
        { params: { baseId } }
      ),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });
  const setRecordAction = useMutation({
    mutationFn: ({
      roleId,
      tableId,
      action,
      enabled,
    }: {
      roleId: string;
      tableId: string;
      action: PermissionAction;
      enabled: boolean;
    }) =>
      axios.put(
        `/admin/permission-matrix/roles/${roleId}/record-action`,
        { tableId, action, enabled },
        { params: { baseId } }
      ),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteRole = useMutation({
    mutationFn: (roleId: string) =>
      axios.delete(`/admin/permission-matrix/roles/${roleId}`, { params: { baseId } }),
    onSuccess: () => {
      invalidate();
      toast.success('Role deleted');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setFieldPermission = useMutation({
    mutationFn: ({
      roleId,
      tableId,
      fieldId,
      access,
    }: {
      roleId: string;
      tableId: string;
      fieldId: string;
      access: 'hidden' | 'readonly' | 'editable';
    }) =>
      axios.put(
        `/admin/permission-matrix/roles/${roleId}/field-permission`,
        { tableId, fieldId, access },
        { params: { baseId } }
      ),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const setRecordFilter = useMutation({
    mutationFn: ({ roleId, tableId, filter }: {
      roleId: string;
      tableId: string;
      filter: unknown;
    }) =>
      axios.put(
        `/admin/permission-matrix/roles/${roleId}/record-filter`,
        { tableId, filter },
        { params: { baseId } }
      ),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const addMember = useMutation({
    mutationFn: ({ roleId, userId }: { roleId: string; userId: string }) =>
      axios.post('/admin/permission-matrix/members', { baseId, roleId, userId }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMember = useMutation({
    mutationFn: ({ roleId, userId }: { roleId: string; userId: string }) =>
      axios.delete('/admin/permission-matrix/members', {
        params: { baseId, roleId, userId },
      }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const setImportExport = useMutation({
    mutationFn: ({
      roleId,
      tableId,
      canImport,
      canExport,
    }: {
      roleId: string;
      tableId: string;
      canImport: boolean;
      canExport: boolean;
    }) =>
      axios.put(
        `/admin/permission-matrix/roles/${roleId}/import-export`,
        { baseId, tableId, canImport, canExport }
      ),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canConfigure) {
    return (
      <div className="flex-1 p-8 text-sm text-destructive">
        You do not have permission to configure this base.
      </div>
    );
  }
  if (roles.isLoading || tables.isLoading) {
    return (
      <div className="flex-1 space-y-4 overflow-y-auto p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (roles.isError || tables.isError) {
    return (
      <div className="flex-1 p-8 text-sm text-destructive">
        Unable to load the authority matrix.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <Head>
        <title>{t('noun.authorityMatrix')}</title>
      </Head>
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t('noun.authorityMatrix')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Configure base roles, table access, and record actions.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Create role</CardTitle>
        </CardHeader>
        <CardContent className="flex max-w-xl items-end gap-3">
          <div className="flex-1 space-y-2">
            <Label htmlFor="authority-role-name">Role name</Label>
            <Input
              id="authority-role-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Sales reviewer"
            />
          </div>
          <Button
            disabled={!name.trim() || createRole.isPending}
            onClick={() => void createRole.mutateAsync()}
          >
            Create
          </Button>
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {(roles.data ?? []).map((role) => (
          <Card key={role.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>{role.name}</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void setEnabled.mutateAsync({
                    roleId: role.id,
                    enabled: role.status !== 'enabled',
                  })
                }
              >
                {role.status === 'enabled' ? 'Disable' : 'Enable'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="text-muted-foreground">
                Status: {role.status} · Members: {role.members.length}
              </div>
              {(tables.data ?? []).map((table) => {
                const access =
                  role.nodes.find((node) => node.tableId === table.id)?.access ?? 'none';
                return (
                  <div className="rounded-md border p-3" key={table.id}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium">{table.name}</span>
                      <select
                        className="rounded border bg-background px-2 py-1"
                        value={access}
                        onChange={(event) =>
                          void setTableAccess.mutateAsync({
                            roleId: role.id,
                            tableId: table.id,
                            access: event.target.value as 'none' | 'editable',
                          })
                        }
                      >
                        <option value="none">No access</option>
                        <option value="editable">Editable</option>
                      </select>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(actionLabels) as PermissionAction[]).map((action) => {
                        const enabled = role.recordActions.some(
                          (item) => item.tableId === table.id && item.action === action
                        );
                        return (
                          <Button
                            key={action}
                            size="sm"
                            variant={enabled ? 'default' : 'outline'}
                            disabled={access === 'none'}
                            onClick={() =>
                              void setRecordAction.mutateAsync({
                                roleId: role.id,
                                tableId: table.id,
                                action,
                                enabled: !enabled,
                              })
                            }
                          >
                            {actionLabels[action]}
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Delete role */}
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteRole.isPending}
                onClick={() => {
                  if (typeof window !== 'undefined' &&
                      window.confirm(`Delete role "${role.name}"?`)) {
                    void deleteRole.mutateAsync(role.id);
                  }
                }}
              >
                Delete role
              </Button>

              {/* Members */}
              <RoleMembersSection
                roleId={role.id}
                members={role.members}
                isPending={addMember.isPending || removeMember.isPending}
                onAdd={(userId) => void addMember.mutateAsync({ roleId: role.id, userId })}
                onRemove={(userId) =>
                  void removeMember.mutateAsync({ roleId: role.id, userId })
                }
              />

              {/* Import / Export */}
              <RoleImportExportSection
                roleId={role.id}
                tables={tables.data ?? []}
                isPending={setImportExport.isPending}
                onChange={(tableId, canImport, canExport) =>
                  void setImportExport.mutateAsync({
                    roleId: role.id,
                    tableId,
                    canImport,
                    canExport,
                  })
                }
              />

              {/* Field permission + record filter per table */}
              {(tables.data ?? []).map((table) => (
                <RoleFieldPermissionSection
                  key={`${role.id}-${table.id}-fields`}
                  roleId={role.id}
                  table={table}
                  isPending={setFieldPermission.isPending || setRecordFilter.isPending}
                  onFieldChange={(fieldId, access) =>
                    void setFieldPermission.mutateAsync({
                      roleId: role.id,
                      tableId: table.id,
                      fieldId,
                      access,
                    })
                  }
                  onFilterChange={(filter) =>
                    void setRecordFilter.mutateAsync({
                      roleId: role.id,
                      tableId: table.id,
                      filter,
                    })
                  }
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      {(roles.data ?? []).length === 0 && (
        <div className="rounded-md border p-8 text-sm text-muted-foreground">
          No roles configured for this base yet.
        </div>
      )}
    </div>
  );
}

// ──────────────────────────── Role sub-sections ────────────────────────────

function RoleMembersSection({
  roleId,
  members,
  isPending,
  onAdd,
  onRemove,
}: {
  roleId: string;
  members: string[];
  isPending: boolean;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const [userId, setUserId] = useState('');
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">Members</span>
        <span className="text-xs text-muted-foreground">{members.length} assigned</span>
      </div>
      {members.length > 0 && (
        <ul className="mb-2 space-y-1 text-xs">
          {members.map((m) => (
            <li key={m} className="flex items-center justify-between">
              <code>{m}</code>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => onRemove(m)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1">
        <Input
          placeholder="user id"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <Button
          size="sm"
          disabled={!userId.trim() || isPending}
          onClick={() => {
            onAdd(userId.trim());
            setUserId('');
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function RoleImportExportSection({
  roleId,
  tables,
  isPending,
  onChange,
}: {
  roleId: string;
  tables: Array<{ id: string; name: string }>;
  isPending: boolean;
  onChange: (tableId: string, canImport: boolean, canExport: boolean) => void;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 font-medium">Import / Export</div>
      <div className="space-y-1 text-xs">
        {tables.map((table) => (
          <div key={table.id} className="flex items-center justify-between">
            <span>{table.name}</span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => onChange(table.id, true, true)}
              >
                Allow both
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={isPending}
                onClick={() => onChange(table.id, false, false)}
              >
                Deny both
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoleFieldPermissionSection({
  roleId,
  table,
  isPending,
  onFieldChange,
  onFilterChange,
}: {
  roleId: string;
  table: { id: string; name: string };
  isPending: boolean;
  onFieldChange: (fieldId: string, access: 'hidden' | 'readonly' | 'editable') => void;
  onFilterChange: (filter: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filterText, setFilterText] = useState('');
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">{table.name} · Advanced</span>
        <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Hide' : 'Show'}
        </Button>
      </div>
      {expanded && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            Field permission: enter a field id and pick an access level.
          </div>
          <FieldPermissionRow
            isPending={isPending}
            onChange={(fieldId, access) => onFieldChange(fieldId, access)}
          />
          <div className="space-y-1">
            <Label htmlFor={`filter-${roleId}-${table.id}`}>Record filter (JSON DSL)</Label>
            <Textarea
              id={`filter-${roleId}-${table.id}`}
              rows={3}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder='{"conjunction":"and","filterSet":[{"fieldId":"fld_xxx","operator":"is","value":"open"}]}'
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  try {
                    const parsed = JSON.parse(filterText);
                    onFilterChange(parsed);
                    toast.success('Filter saved');
                  } catch {
                    toast.error('Invalid JSON');
                  }
                }}
              >
                Save filter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FieldPermissionRow({
  isPending,
  onChange,
}: {
  isPending: boolean;
  onChange: (fieldId: string, access: 'hidden' | 'readonly' | 'editable') => void;
}) {
  const [fieldId, setFieldId] = useState('');
  const [access, setAccess] = useState<'hidden' | 'readonly' | 'editable'>('editable');
  return (
    <div className="flex gap-1">
      <Input
        placeholder="fld_xxx"
        value={fieldId}
        onChange={(e) => setFieldId(e.target.value)}
      />
      <Select value={access} onValueChange={(v) => setAccess(v as typeof access)}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="hidden">hidden</SelectItem>
          <SelectItem value="readonly">readonly</SelectItem>
          <SelectItem value="editable">editable</SelectItem>
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!fieldId.trim() || isPending}
        onClick={() => {
          onChange(fieldId.trim(), access);
          setFieldId('');
        }}
      >
        Set
      </Button>
    </div>
  );
}
