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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@teable/ui-lib/shadcn';
import { Trash2 } from '@teable/icons';
import type { ReactElement } from 'react';
import { useState } from 'react';

interface ISsoProvider {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  protocol?: 'saml' | 'oidc';
  enabled?: boolean;
}

export function SsoAdminPanel(): ReactElement {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [clientId, setClientId] = useState('');
  const [protocol, setProtocol] = useState<'saml' | 'oidc'>('oidc');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-sso-providers'],
    queryFn: () =>
      axios.get<ISsoProvider[]>('/admin/sso/providers').then((r) => r.data),
  });

  const create = useMutation({
    mutationFn: (payload: { name: string; issuer: string; clientId: string; protocol: string }) =>
      axios.post('/admin/sso/providers', payload).then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-sso-providers'] });
      setName('');
      setIssuer('');
      setClientId('');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => axios.delete(`/admin/sso/providers/${id}`).then((r) => r.data),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['admin-sso-providers'] }),
  });

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>SSO providers</CardTitle>
          <CardDescription>
            Identity providers for SAML / OIDC. Each provider covers one IdP issuer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="sso-name">Display name</Label>
              <Input id="sso-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="acme.okta" />
            </div>
            <div>
              <Label htmlFor="sso-protocol">Protocol</Label>
              <select
                id="sso-protocol"
                className="w-full rounded border px-3 py-2 text-sm"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value as 'saml' | 'oidc')}
              >
                <option value="oidc">OIDC</option>
                <option value="saml">SAML 2.0</option>
              </select>
            </div>
            <div>
              <Label htmlFor="sso-issuer">Issuer / Entity ID</Label>
              <Input id="sso-issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="https://idp.example.com" />
            </div>
            <div>
              <Label htmlFor="sso-clientId">Client ID (OIDC) / SP entity (SAML)</Label>
              <Input id="sso-clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} />
            </div>
          </div>
          <Button
            disabled={!name || !issuer || !clientId || create.isPending}
            onClick={() => create.mutate({ name, issuer, clientId, protocol })}
          >
            {create.isPending ? 'Saving…' : 'Add provider'}
          </Button>
          {create.isError ? (
            <p className="text-sm text-red-600">{(create.error as Error).message}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered providers ({data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No SSO providers registered. Use the form above to add one.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Protocol</TableHead>
                  <TableHead>Issuer</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      <Badge variant={p.protocol === 'saml' ? 'default' : 'secondary'}>
                        {p.protocol?.toUpperCase() ?? 'OIDC'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.issuer}</TableCell>
                    <TableCell className="font-mono text-xs">{p.clientId}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => remove.mutate(p.id)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="size-4" />
                      </Button>
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
