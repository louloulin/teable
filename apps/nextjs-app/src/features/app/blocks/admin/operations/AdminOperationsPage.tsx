import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listAdminQuotaHits,
  listAdminSpaces,
  listAdminUsers,
  deleteAdminSpace,
  updateAdminSpace,
  updateAdminUser,
  restoreAdminUser,
  deleteAdminUser,
  permanentlyDeleteAdminUser,
} from '@teable/openapi';
import { Button, Skeleton } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

export const AdminOperationsPage = () => {
  const queryClient = useQueryClient();
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => listAdminUsers({ take: 100 }).then(({ data }) => data),
  });
  const spaces = useQuery({
    queryKey: ['admin', 'spaces'],
    queryFn: () => listAdminSpaces({ take: 100 }).then(({ data }) => data),
  });
  const quota = useQuery({
    queryKey: ['admin', 'quota-dashboard'],
    queryFn: () => listAdminQuotaHits({ take: 50 }).then(({ data }) => data),
  });
  const updateUser = useMutation({
    mutationFn: ({
      userId,
      active,
      isAdmin,
    }: {
      userId: string;
      active?: boolean;
      isAdmin?: boolean;
    }) => updateAdminUser(userId, { active, isAdmin }),
    onSuccess: () => {
      toast.success('User updated');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const updateSpace = useMutation({
    mutationFn: ({
      spaceId,
      name,
      autoJoin,
    }: {
      spaceId: string;
      name?: string;
      autoJoin?: boolean;
    }) => updateAdminSpace(spaceId, { name, autoJoin }),
    onSuccess: () => {
      toast.success('Space updated');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'spaces'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const userAction = useMutation({
    mutationFn: async ({
      action,
      userId,
    }: {
      action: 'restore' | 'delete' | 'permanent';
      userId: string;
    }) => {
      if (action === 'restore') return restoreAdminUser(userId);
      if (action === 'delete') return deleteAdminUser(userId);
      return permanentlyDeleteAdminUser(userId);
    },
    onSuccess: () => {
      toast.success('User updated');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deleteSpace = useMutation({
    mutationFn: deleteAdminSpace,
    onSuccess: () => {
      toast.success('Space deleted');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'spaces'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const loading = users.isLoading || spaces.isLoading || quota.isLoading;
  if (loading) {
    return (
      <div className="flex h-screen flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const error = users.error ?? spaces.error ?? quota.error;
  if (error) {
    return (
      <div className="flex h-screen flex-1 items-start p-4 text-sm text-destructive sm:p-8">
        {error instanceof Error ? error.message : 'Unable to load admin operations'}
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-1 flex-col gap-8 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-xl font-semibold">Operations</h1>
        <p className="text-sm text-muted-foreground">
          Instance users, spaces, and quota events available to administrators.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Users ({users.data?.total ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3">Last sign-in</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users.data?.list ?? []).map((user) => (
                <tr className="border-b last:border-0" key={user.id}>
                  <td className="p-3">{user.name ?? '—'}</td>
                  <td className="p-3">{user.email}</td>
                  <td className="p-3">{user.isAdmin ? 'Admin' : 'Member'}</td>
                  <td className="p-3">
                    {user.deletedTime ? 'Deleted' : user.deactivatedTime ? 'Inactive' : 'Active'}
                  </td>
                  <td className="p-3 text-muted-foreground">{formatDate(user.lastSignTime)}</td>
                  <td className="flex gap-2 p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(user.isSystem) || updateUser.isPending}
                      onClick={() =>
                        void updateUser.mutate({
                          userId: user.id,
                          active: Boolean(user.deactivatedTime),
                        })
                      }
                    >
                      {user.deactivatedTime ? 'Activate' : 'Deactivate'}
                    </Button>
                    {user.deletedTime ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={userAction.isPending}
                        onClick={() =>
                          void userAction.mutate({ action: 'restore', userId: user.id })
                        }
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={Boolean(user.isSystem) || userAction.isPending}
                        onClick={() =>
                          window.confirm(`Delete user "${user.email}"?`) &&
                          void userAction.mutate({ action: 'delete', userId: user.id })
                        }
                      >
                        Delete
                      </Button>
                    )}
                    {user.deletedTime && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={Boolean(user.isSystem) || userAction.isPending}
                        onClick={() =>
                          window.confirm(`Permanently delete user "${user.email}"?`) &&
                          void userAction.mutate({ action: 'permanent', userId: user.id })
                        }
                      >
                        Permanent delete
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={Boolean(user.isSystem) || updateUser.isPending}
                      onClick={() =>
                        void updateUser.mutate({ userId: user.id, isAdmin: !user.isAdmin })
                      }
                    >
                      {user.isAdmin ? 'Remove admin' : 'Make admin'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Spaces ({spaces.data?.total ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Created by</th>
                <th className="p-3">Bases</th>
                <th className="p-3">Collaborators</th>
                <th className="p-3">Auto-join</th>
                <th className="p-3">Created</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(spaces.data?.list ?? []).map((space) => (
                <tr className="border-b last:border-0" key={space.id}>
                  <td className="p-3">{space.name}</td>
                  <td className="p-3">{space.createdBy}</td>
                  <td className="p-3">{space.baseCount}</td>
                  <td className="p-3">{space.collaboratorCount}</td>
                  <td className="p-3">{space.autoJoin ? 'Enabled' : 'Disabled'}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(space.createdTime)}</td>
                  <td className="flex gap-2 p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateSpace.isPending || deleteSpace.isPending}
                      onClick={() => {
                        const name = window.prompt('New space name', space.name)?.trim();
                        if (name && name !== space.name) {
                          void updateSpace.mutate({ spaceId: space.id, name });
                        }
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={updateSpace.isPending || deleteSpace.isPending}
                      onClick={() =>
                        void updateSpace.mutate({ spaceId: space.id, autoJoin: !space.autoJoin })
                      }
                    >
                      {space.autoJoin ? 'Disable auto-join' : 'Enable auto-join'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={updateSpace.isPending || deleteSpace.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete space "${space.name}"?`)) {
                          void deleteSpace.mutate(space.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Quota events ({quota.data?.total ?? 0})</h2>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3">Metric</th>
                <th className="p-3">Attempted / cap</th>
                <th className="p-3">Resource</th>
                <th className="p-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {(quota.data?.list ?? []).map((hit) => (
                <tr className="border-b last:border-0" key={hit.id}>
                  <td className="p-3">{hit.metric}</td>
                  <td className="p-3">
                    {hit.attempted} / {hit.cap}
                  </td>
                  <td className="p-3">{hit.resource ?? '—'}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(hit.createdTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
