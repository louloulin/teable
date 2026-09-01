import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@teable/ui-lib/shadcn';
import type { ReactElement } from 'react';
import { useState } from 'react';

interface ISpace {
  id: string;
  name: string;
}

interface IQuotaUsage {
  rowsUsed: number;
  rowsLimit: number | null;
  seatsUsed: number;
  seatsLimit: number | null;
}

export function QuotaAdminPanel(): ReactElement {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ spaceId: string; rows: string; seats: string } | null>(
    null
  );

  const spaces = useQuery({
    queryKey: ['admin-quota-spaces'],
    queryFn: () => axios.get<ISpace[]>('/space').then((r) => r.data ?? []),
  });

  const quotas = useQuery({
    queryKey: ['admin-quota-all'],
    queryFn: async () => {
      const list = spaces.data ?? [];
      const entries = await Promise.all(
        list.map(async (s) => {
          try {
            const { data } = await axios.get<IQuotaUsage>(`/quota/${s.id}`);
            return [s.id, { space: s, usage: data }] as const;
          } catch {
            return [s.id, { space: s, usage: null }] as const;
          }
        })
      );
      return entries;
    },
    enabled: !!spaces.data,
  });

  const update = useMutation({
    mutationFn: (input: { spaceId: string; rowsLimit: number | null; seatsLimit: number | null }) =>
      axios
        .put(`/quota/${input.spaceId}`, {
          rowsLimit: input.rowsLimit,
          seatsLimit: input.seatsLimit,
        })
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-quota-all'] });
      setEditing(null);
    },
  });

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Plan, row and seat quotas</CardTitle>
          <CardDescription>
            Override per-space limits. Leave empty to use the license plan defaults.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {spaces.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Space</TableHead>
                  <TableHead>Rows used</TableHead>
                  <TableHead>Rows limit</TableHead>
                  <TableHead>Seats used</TableHead>
                  <TableHead>Seats limit</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(quotas.data ?? []).map(([id, entry]) => {
                  const isEditing = editing?.spaceId === id;
                  const u = entry.usage;
                  return (
                    <TableRow key={id}>
                      <TableCell className="font-medium">{entry.space.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u?.rowsUsed ?? '—'}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={editing.rows ?? ''}
                            onChange={(e) =>
                              setEditing({ ...editing, spaceId: id, rows: e.target.value })
                            }
                            placeholder="unlimited"
                            className="w-24"
                          />
                        ) : (
                          <span className="font-mono text-xs">
                            {u?.rowsLimit ?? '∞'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {u?.seatsUsed ?? '—'}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            value={editing.seats ?? ''}
                            onChange={(e) =>
                              setEditing({ ...editing, spaceId: id, seats: e.target.value })
                            }
                            placeholder="unlimited"
                            className="w-24"
                          />
                        ) : (
                          <span className="font-mono text-xs">
                            {u?.seatsLimit ?? '∞'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              disabled={update.isPending}
                              onClick={() =>
                                update.mutate({
                                  spaceId: id,
                                  rowsLimit: editing.rows ? Number(editing.rows) : null,
                                  seatsLimit: editing.seats ? Number(editing.seats) : null,
                                })
                              }
                            >
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setEditing({
                            spaceId: id,
                            rows: u?.rowsLimit?.toString() ?? '',
                            seats: u?.seatsLimit?.toString() ?? '',
                          })}>
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {spaces.data && spaces.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                      No spaces yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
