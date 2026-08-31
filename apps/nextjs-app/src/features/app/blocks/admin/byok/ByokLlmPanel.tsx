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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useState } from 'react';

// ──────────────────────────── Types ────────────────────────────

type LlmProvider = 'openai' | 'anthropic' | 'google' | 'mistral' | 'bedrock' | 'azure' | 'custom';
type LlmKeyStatus = 'active' | 'rate-limited' | 'exhausted' | 'disabled' | 'invalid';

interface ILlmProviderKey {
  id: string;
  orgId: string;
  provider: LlmProvider;
  alias: string;
  status: LlmKeyStatus;
  ciphertextRef: string;
  fingerprint: string;
  verifiedAt: string | null;
  lastUsedAt: string | null;
  providerTpmCap: number;
  orgDailyCap: number;
  isolation: 'exclusive' | 'shared' | 'passthrough';
  createdAt: string;
  updatedAt: string;
}

interface IHealthSnapshot {
  provider: LlmProvider;
  keyId: string;
  status: LlmKeyStatus;
  successRate1m: number;
  p50LatencyMs: number;
  quotaRemainingCents: number | null;
  observedAt: string;
}

const PROVIDERS: ReadonlyArray<LlmProvider> = [
  'openai',
  'anthropic',
  'google',
  'mistral',
  'bedrock',
  'azure',
  'custom',
];

const STATUS_COLOR: Record<LlmKeyStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'secondary',
  'rate-limited': 'outline',
  exhausted: 'destructive',
  disabled: 'outline',
  invalid: 'destructive',
};

// ──────────────────────────── Component ────────────────────────────

export const ByokLlmPanel = () => {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('');
  const [provider, setProvider] = useState<LlmProvider>('openai');
  const [friendlyName, setFriendlyName] = useState('');
  const [ciphertextRef, setCiphertextRef] = useState('');
  const [plaintext, setPlaintext] = useState('');

  const keysQuery = useQuery({
    queryKey: ['admin', 'byok-llm', 'keys', orgId],
    enabled: Boolean(orgId),
    queryFn: () =>
      axios
        .get<{ keys: ILlmProviderKey[] }>(`/api/admin/byok-llm/keys/${orgId}`)
        .then((r) => r.data.keys),
  });

  const register = useMutation({
    mutationFn: () =>
      axios.post<ILlmProviderKey>(`/api/admin/byok-llm/keys/${orgId}`, {
        provider,
        friendlyName: friendlyName.trim(),
        ciphertextRef: ciphertextRef.trim(),
        plaintext: plaintext.trim() || undefined,
        isolation: 'exclusive',
      }),
    onSuccess: () => {
      setFriendlyName('');
      setCiphertextRef('');
      setPlaintext('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'byok-llm'] });
      toast.success('BYOK key registered');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disable = useMutation({
    mutationFn: (keyId: string) =>
      axios.delete<{ disabled: boolean }>(`/api/admin/byok-llm/keys/${keyId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'byok-llm'] });
      toast.success('Key disabled');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const keys = keysQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">BYOK · LLM</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Register per-organization LLM API keys. Ciphertext envelopes are produced out-of-band
          (see the BYOK · KMS tab).
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Target organization</CardTitle>
          <CardDescription>
            Enter an org id to scope the keys listed below. The org id is the primary key on
            <code> organization</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="org_xxx"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Register a new key</CardTitle>
          <CardDescription>
            Plaintext is local-only — it is used to compute a fingerprint and never persisted.
            Submit the <code>ciphertextRef</code> produced by the BYOK KMS endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as LlmProvider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Friendly name</Label>
              <Input
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder="e.g. production-east"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Ciphertext reference (envelope)</Label>
            <Input
              value={ciphertextRef}
              onChange={(e) => setCiphertextRef(e.target.value)}
              placeholder="env:v1:…"
            />
          </div>
          <div className="space-y-1">
            <Label>
              Plaintext (optional, fingerprint only — never persisted)
            </Label>
            <Input
              type="password"
              autoComplete="off"
              value={plaintext}
              onChange={(e) => setPlaintext(e.target.value)}
              placeholder="sk-…"
            />
          </div>
          <div className="flex justify-end">
            <Button
              disabled={
                !orgId ||
                !friendlyName.trim() ||
                !ciphertextRef.trim() ||
                register.isPending
              }
              onClick={() => register.mutate()}
            >
              {register.isPending ? 'Registering…' : 'Register key'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Registered keys ({keys.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {!orgId ? (
            <div className="text-sm text-muted-foreground">Enter an org id above to list keys.</div>
          ) : keysQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : keys.length === 0 ? (
            <div className="text-sm text-muted-foreground">No keys for this org.</div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <KeyRow key={k.id} item={k} onDisable={() => disable.mutate(k.id)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ──────────────────────────── KeyRow ────────────────────────────

function KeyRow({ item, onDisable }: { item: ILlmProviderKey; onDisable: () => void }) {
  const healthQuery = useQuery({
    queryKey: ['admin', 'byok-llm', 'health', item.id],
    queryFn: () =>
      axios
        .get<IHealthSnapshot>(`/api/admin/byok-llm/keys/${item.id}/health`)
        .then((r) => r.data),
    refetchInterval: 10_000,
  });

  return (
    <div className="flex items-center justify-between rounded border p-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{item.alias}</span>
          <Badge variant="outline">{item.provider}</Badge>
          <Badge variant={STATUS_COLOR[item.status]}>{item.status}</Badge>
        </div>
        <div className="text-xs text-muted-foreground">
          fingerprint: <code>{item.fingerprint || '—'}</code> · daily cap:{' '}
          {item.orgDailyCap || '∞'} · tpm cap: {item.providerTpmCap || 'unknown'}
        </div>
        {healthQuery.data && (
          <div className="text-xs text-muted-foreground">
            health · success 1m: {(healthQuery.data.successRate1m * 100).toFixed(0)}% · p50:{' '}
            {Math.round(healthQuery.data.p50LatencyMs)}ms
          </div>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={item.status === 'disabled' || onDisable === undefined}
        onClick={onDisable}
      >
        Disable
      </Button>
    </div>
  );
}
