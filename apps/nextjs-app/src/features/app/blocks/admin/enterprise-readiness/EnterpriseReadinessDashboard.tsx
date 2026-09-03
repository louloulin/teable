import { useQuery } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@teable/ui-lib';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@teable/ui-lib/shadcn/ui/tabs';
import { useMemo, useState } from 'react';

type ReadinessState = 'oss' | 'self_hosted' | 'cloud';

interface IReadinessEvidence {
  kind: string;
  detail?: string;
  lastProbeAt?: string;
}

interface IReadinessCapability {
  key: string;
  module: string;
  enabled: boolean;
  state: ReadinessState;
  wired: boolean;
  configured: boolean;
  verified: boolean;
  parity: boolean;
  reason?: string;
  evidence?: IReadinessEvidence;
}

interface IReadinessCounts {
  total: number;
  oss: number;
  selfHosted: number;
  cloud: number;
}

interface IReadinessPlan {
  level: string;
  label: string;
  licenseSource: string;
}

interface IReadinessManifest {
  generatedAt: string;
  plan: IReadinessPlan;
  counts: IReadinessCounts;
  capabilities: IReadinessCapability[];
}

const TOKEN_STORAGE_KEY = 'teable.admin-token';

function readAdminToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeAdminToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    /* localStorage unavailable */
  }
}

const STATE_LABEL: Record<ReadinessState, string> = {
  oss: 'OSS (default)',
  self_hosted: 'Self-hosted (needs config)',
  cloud: 'Cloud only',
};

const STATE_VARIANT: Record<ReadinessState, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  oss: 'default',
  self_hosted: 'secondary',
  cloud: 'outline',
};

export function EnterpriseReadinessDashboard() {
  const [adminToken, setAdminToken] = useState<string>(() => readAdminToken());
  const [draftToken, setDraftToken] = useState<string>(adminToken);

  const ready = useQuery({
    queryKey: ['admin', 'enterprise-readiness', 'manifest', adminToken],
    enabled: Boolean(adminToken),
    queryFn: async () => {
      const { data } = await axios.get<IReadinessManifest>(
        '/api/admin/enterprise-readiness/manifest',
        { headers: { 'x-admin-token': adminToken } }
      );
      return data;
    },
    retry: false,
  });

  const capabilitiesByState = useMemo(() => {
    const groups: Record<ReadinessState, IReadinessCapability[]> = {
      oss: [],
      self_hosted: [],
      cloud: [],
    };
    if (ready.data) {
      for (const c of ready.data.capabilities) {
        groups[c.state].push(c);
      }
      for (const state of Object.keys(groups) as ReadinessState[]) {
        groups[state].sort((a, b) => a.key.localeCompare(b.key));
      }
    }
    return groups;
  }, [ready.data]);

  const onSaveToken = () => {
    const trimmed = draftToken.trim();
    writeAdminToken(trimmed);
    setAdminToken(trimmed);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Enterprise Readiness</CardTitle>
          <CardDescription>
            Three-state classification of every enterprise capability — OSS
            (default-on), self-hosted (operator must configure), Cloud only
            (requires Teable Cloud).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Reads from{' '}
            <code className="rounded bg-muted px-1 py-0.5">
              GET /api/admin/enterprise-readiness/manifest
            </code>{' '}
            with header{' '}
            <code className="rounded bg-muted px-1 py-0.5">x-admin-token</code>{' '}
            matching{' '}
            <code className="rounded bg-muted px-1 py-0.5">
              TEABLE_ADMIN_TOKEN
            </code>
            . Token is stored in browser localStorage only.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grow space-y-1">
              <label className="text-xs font-medium" htmlFor="admin-token">
                Admin token
              </label>
              <Input
                id="admin-token"
                type="password"
                autoComplete="off"
                placeholder="paste TEABLE_ADMIN_TOKEN here"
                value={draftToken}
                onChange={(event) => setDraftToken(event.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={onSaveToken}
              className="rounded-md border bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Save & load manifest
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftToken('');
                writeAdminToken('');
                setAdminToken('');
              }}
              className="rounded-md border bg-background px-3 py-1 text-sm hover:bg-accent"
            >
              Clear
            </button>
          </div>
        </CardContent>
      </Card>

      {!adminToken ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Paste the admin token to load the manifest.
          </CardContent>
        </Card>
      ) : ready.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : ready.isError ? (
        <Card>
          <CardContent className="space-y-2 py-6 text-sm">
            <p className="font-medium text-destructive">
              Failed to load manifest
            </p>
            <p className="text-muted-foreground">
              {(ready.error as Error)?.message ?? 'Unknown error'} — verify the
              token matches <code>TEABLE_ADMIN_TOKEN</code> and the server is
              reachable.
            </p>
          </CardContent>
        </Card>
      ) : ready.data ? (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total</CardDescription>
                <CardTitle className="text-2xl">
                  {ready.data.counts.total}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                Plan: {ready.data.plan.label} ({ready.data.plan.licenseSource})
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>OSS (default)</CardDescription>
                <CardTitle className="text-2xl">
                  {ready.data.counts.oss}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                wired + configured out of the box
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Self-hosted</CardDescription>
                <CardTitle className="text-2xl">
                  {ready.data.counts.selfHosted}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                wired; operator must configure
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Cloud only</CardDescription>
                <CardTitle className="text-2xl">
                  {ready.data.counts.cloud}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                requires Teable Cloud subscription
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Capabilities</CardTitle>
              <CardDescription>
                Generated {new Date(ready.data.generatedAt).toLocaleString()}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="cloud">
                <TabsList>
                  <TabsTrigger value="cloud">
                    Cloud only ({ready.data.counts.cloud})
                  </TabsTrigger>
                  <TabsTrigger value="self_hosted">
                    Self-hosted ({ready.data.counts.selfHosted})
                  </TabsTrigger>
                  <TabsTrigger value="oss">
                    OSS ({ready.data.counts.oss})
                  </TabsTrigger>
                </TabsList>
                {(['cloud', 'self_hosted', 'oss'] as ReadinessState[]).map(
                  (state) => (
                    <TabsContent key={state} value={state} className="mt-4">
                      <CapabilityTable
                        rows={capabilitiesByState[state]}
                        state={state}
                      />
                    </TabsContent>
                  )
                )}
              </Tabs>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function CapabilityTable({
  rows,
  state,
}: {
  rows: IReadinessCapability[];
  state: ReadinessState;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No capabilities in the {STATE_LABEL[state]} state.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Capability</TableHead>
          <TableHead>Module</TableHead>
          <TableHead>State</TableHead>
          <TableHead>Wired</TableHead>
          <TableHead>Configured</TableHead>
          <TableHead>Verified</TableHead>
          <TableHead>Parity</TableHead>
          <TableHead>Reason / evidence</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((c) => (
          <TableRow key={c.key}>
            <TableCell className="font-mono text-xs">{c.key}</TableCell>
            <TableCell className="text-xs">{c.module}</TableCell>
            <TableCell>
              <Badge variant={STATE_VARIANT[c.state]}>{STATE_LABEL[state]}</Badge>
            </TableCell>
            <TableCell>{c.wired ? '✓' : '—'}</TableCell>
            <TableCell>{c.configured ? '✓' : '—'}</TableCell>
            <TableCell>{c.verified ? '✓' : '—'}</TableCell>
            <TableCell>{c.parity ? '✓' : '—'}</TableCell>
            <TableCell className="max-w-[20rem] text-xs text-muted-foreground">
              {c.reason ??
                (c.evidence
                  ? `${c.evidence.kind}${c.evidence.detail ? ` — ${c.evidence.detail}` : ''}`
                  : '—')}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
