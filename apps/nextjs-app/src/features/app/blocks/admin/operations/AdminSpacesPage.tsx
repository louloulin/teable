import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteAdminSpace, listAdminSpaces, updateAdminSpace } from '@teable/openapi';
import { Button, Skeleton } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';

const formatDate = (value: string) => new Date(value).toLocaleString();

export const AdminSpacesPage = () => {
  const queryClient = useQueryClient();
  const spaces = useQuery({
    queryKey: ['admin', 'spaces'],
    queryFn: () => listAdminSpaces({ take: 100 }).then(({ data }) => data),
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
  const deleteSpace = useMutation({
    mutationFn: deleteAdminSpace,
    onSuccess: () => {
      toast.success('Space deleted');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'spaces'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (spaces.isLoading) {
    return <Skeleton className="m-8 h-48 flex-1" />;
  }
  if (spaces.error) {
    return <div className="flex-1 p-8 text-sm text-destructive">{spaces.error.message}</div>;
  }

  return (
    <div className="flex h-screen flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Spaces</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage spaces, auto-join behavior, collaborators, and deletion.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Bases</th>
              <th className="p-3">Collaborators</th>
              <th className="p-3">Auto-join</th>
              <th className="p-3">Created</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(spaces.data?.list ?? []).map((space) => {
              const busy = updateSpace.isPending || deleteSpace.isPending;
              return (
                <tr className="border-b last:border-0" key={space.id}>
                  <td className="p-3">{space.name}</td>
                  <td className="p-3">{space.baseCount}</td>
                  <td className="p-3">{space.collaboratorCount}</td>
                  <td className="p-3">{space.autoJoin ? 'Enabled' : 'Disabled'}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(space.createdTime)}</td>
                  <td className="flex flex-wrap gap-2 p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
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
                      disabled={busy}
                      onClick={() =>
                        void updateSpace.mutate({ spaceId: space.id, autoJoin: !space.autoJoin })
                      }
                    >
                      {space.autoJoin ? 'Disable auto-join' : 'Enable auto-join'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(`Delete space "${space.name}"? This cannot be undone.`)
                        ) {
                          void deleteSpace.mutate(space.id);
                        }
                      }}
                    >
                      Delete
                    </Button>
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
