import { useQuery } from '@tanstack/react-query';
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
import { ArrowUpRight } from '@teable/icons';
import type { ReactElement } from 'react';

interface ISsoProvider {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  protocol?: 'saml' | 'oidc';
}

interface ISamlMetadata {
  entityId?: string;
  ssoUrl?: string;
  certificate?: string;
}

export function SamlAdminPanel(): ReactElement {
  const providers = useQuery({
    queryKey: ['admin-sso-providers'],
    queryFn: () =>
      axios.get<ISsoProvider[]>('/admin/sso/providers').then((r) => r.data),
  });

  const spMetadata = useQuery({
    queryKey: ['admin-saml-sp-metadata'],
    queryFn: () =>
      axios
        .get<ISamlMetadata>('/auth/saml/metadata?name=teable')
        .then((r) => r.data)
        .catch(() => ({})),
  });

  const samlProviders = (providers.data ?? []).filter((p) => p.protocol === 'saml');

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>SAML Service Provider metadata</CardTitle>
          <CardDescription>
            Share this XML with each IdP administrator. It describes the Teable SP endpoints.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">Entity ID</p>
              <code className="block rounded bg-muted px-2 py-1">
                {(spMetadata.data as ISamlMetadata | undefined)?.entityId ?? 'teable'}
              </code>
            </div>
            <div>
              <p className="text-muted-foreground">ACS URL</p>
              <code className="block rounded bg-muted px-2 py-1">
                POST /api/auth/saml/callback
              </code>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button asChild size="sm" variant="outline">
              <a href="/api/auth/saml/metadata?name=teable" target="_blank" rel="noreferrer">
                <ArrowUpRight className="mr-1 size-3" /> Download metadata XML
              </a>
            </Button>
            <Button asChild size="sm" variant="outline">
              <a href="/api/auth/saml/login" target="_blank" rel="noreferrer">
                Test IdP-initiated login
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SAML identity providers ({samlProviders.length})</CardTitle>
          <CardDescription>
            IdPs registered with protocol = SAML. Configure in <code>SSO providers</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {providers.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : samlProviders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No SAML IdP configured yet. Add one in the SSO panel with protocol = SAML.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Entity ID / Issuer</TableHead>
                  <TableHead>SP identifier</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {samlProviders.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.issuer}</TableCell>
                    <TableCell className="font-mono text-xs">{p.clientId}</TableCell>
                    <TableCell>
                      <Badge variant="default">SAML 2.0</Badge>
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
