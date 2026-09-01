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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@teable/ui-lib/shadcn';
import { Trash2 } from '@teable/icons';
import type { ReactElement } from 'react';

interface ITotpFactor {
  factorId: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  label: string;
  enabled: boolean;
  createdTime: string;
}

export function TotpAdminPanel(): ReactElement {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-totp-factors'],
    queryFn: () => axios.get<ITotpFactor[]>('/admin/totp/factors').then((r) => r.data),
  });

  const revoke = useMutation({
    mutationFn: (factorId: string) =>
      axios.delete(`/admin/totp/factors/${factorId}`).then((r) => r.data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-totp-factors'] }),
  });

  const factors = data ?? [];
  const enabled = factors.filter((f) => f.enabled);
  const disabled = factors.filter((f) => !f.enabled);

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>TOTP 2FA factors ({factors.length})</CardTitle>
          <CardDescription>
            Per-user authenticator-app enrolments. Admins can revoke any factor when a user is
            locked out.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-2xl font-semibold">{factors.length}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-semibold text-green-600">{enabled.length}</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Revoked</p>
              <p className="text-2xl font-semibold text-muted-foreground">{disabled.length}</p>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : factors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No TOTP factors enrolled yet. Users enrol via the auth settings page.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {factors.map((f) => (
                  <TableRow key={f.factorId}>
                    <TableCell>
                      <p className="font-medium">{f.userName ?? f.userId}</p>
                      {f.userEmail ? (
                        <p className="text-xs text-muted-foreground">{f.userEmail}</p>
                      ) : null}
                    </TableCell>
                    <TableCell>{f.label}</TableCell>
                    <TableCell>
                      <Badge variant={f.enabled ? 'default' : 'secondary'}>
                        {f.enabled ? 'active' : 'revoked'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(f.createdTime).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {f.enabled ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={revoke.isPending}
                          onClick={() => revoke.mutate(f.factorId)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
