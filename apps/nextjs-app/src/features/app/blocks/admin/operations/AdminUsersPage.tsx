import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAdminPasswordReset,
  deleteAdminUser,
  listAdminUsers,
  permanentlyDeleteAdminUser,
  restoreAdminUser,
  updateAdminUser,
} from '@teable/openapi';
import { Button, Input, Skeleton } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useState } from 'react';

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

export const AdminUsersPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const users = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () =>
      listAdminUsers({ take: 100, ...(search ? { search } : {}) }).then(({ data }) => data),
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
      toast.success('User status updated');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const passwordReset = useMutation({
    mutationFn: ({ userId, sendEmail }: { userId: string; sendEmail: boolean }) =>
      createAdminPasswordReset(userId, { sendEmail }),
    onSuccess: async ({ data }) => {
      await navigator.clipboard?.writeText(data.resetPasswordUrl);
      toast.success(`Reset link copied; expires ${formatDate(data.expiresAt)}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (users.isLoading) {
    return <Skeleton className="m-8 h-48 flex-1" />;
  }
  if (users.error) {
    return <div className="flex-1 p-8 text-sm text-destructive">{users.error.message}</div>;
  }

  return (
    <div className="flex h-screen flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage instance users, administrators, account status, and deletion.
        </p>
      </div>
      <div className="flex max-w-xl gap-2">
        <Input
          value={search}
          placeholder="Search by name or email"
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button variant="outline" onClick={() => setSearch('')} disabled={!search}>
          Clear
        </Button>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Email</th>
              <th className="p-3">Role</th>
              <th className="p-3">Status</th>
              <th className="p-3">Last login</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users.data?.list ?? []).map((user) => {
              const deleted = Boolean(user.deletedTime);
              const inactive = Boolean(user.deactivatedTime);
              const busy = updateUser.isPending || userAction.isPending || passwordReset.isPending;
              return (
                <tr className="border-b last:border-0" key={user.id}>
                  <td className="p-3">{user.name ?? '—'}</td>
                  <td className="p-3">{user.email}</td>
                  <td className="p-3">{user.isAdmin ? 'Admin' : 'Member'}</td>
                  <td className="p-3">{deleted ? 'Deleted' : inactive ? 'Inactive' : 'Active'}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(user.lastSignTime)}</td>
                  <td className="flex flex-wrap gap-2 p-3">
                    {!deleted && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || Boolean(user.isSystem)}
                        onClick={() =>
                          void updateUser.mutate({ userId: user.id, active: inactive })
                        }
                      >
                        {inactive ? 'Activate' : 'Deactivate'}
                      </Button>
                    )}
                    {deleted && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || Boolean(user.isSystem)}
                        onClick={() =>
                          void userAction.mutate({ action: 'restore', userId: user.id })
                        }
                      >
                        Restore
                      </Button>
                    )}
                    {!deleted && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy || Boolean(user.isSystem)}
                        onClick={() =>
                          void updateUser.mutate({ userId: user.id, isAdmin: !user.isAdmin })
                        }
                      >
                        {user.isAdmin ? 'Remove admin' : 'Make admin'}
                      </Button>
                    )}
                    {!deleted && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || Boolean(user.isSystem)}
                        onClick={() => {
                          const sendEmail = window.confirm(
                            `Send the reset link to ${user.email}? Cancel copies a link without sending.`
                          );
                          void passwordReset.mutate({ userId: user.id, sendEmail });
                        }}
                      >
                        Reset password
                      </Button>
                    )}
                    {!deleted && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || Boolean(user.isSystem)}
                        onClick={() => {
                          if (window.confirm(`Delete ${user.email}?`)) {
                            void userAction.mutate({ action: 'delete', userId: user.id });
                          }
                        }}
                      >
                        Delete
                      </Button>
                    )}
                    {deleted && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || Boolean(user.isSystem)}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Permanently delete ${user.email}? This cannot be undone.`
                            )
                          ) {
                            void userAction.mutate({ action: 'permanent', userId: user.id });
                          }
                        }}
                      >
                        Permanent delete
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
