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
  Textarea,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useState } from 'react';

type KmsProvider = 'aws' | 'gcp' | 'azure' | 'vault' | 'local';

interface ICustomerKmsKey {
  id: string;
  organizationId: string;
  alias: string;
  provider: KmsProvider;
  keyId: string;
  keyVersion: string | null;
  status: 'enabled' | 'disabled' | 'rotating' | 'compromised';
  rotationPolicyJson: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const PROVIDERS: ReadonlyArray<KmsProvider> = ['aws', 'gcp', 'azure', 'vault', 'local'];

export const ByokKmsPanel = () => {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('');
  const [alias, setAlias] = useState('');
  const [provider, setProvider] = useState<KmsProvider>('local');
  const [keyId, setKeyId] = useState('');
  const [keyVersion, setKeyVersion] = useState('');
  const [createdBy, setCreatedBy] = useState('admin');
  const [plaintext, setPlaintext] = useState('');
  const [envelopeJson, setEnvelopeJson] = useState('');
  const [ciphertextRef, setCiphertextRef] = useState('');
  const [decryptedOutput, setDecryptedOutput] = useState('');

  const keysQuery = useQuery({
    queryKey: ['admin', 'byok-kms', 'keys', orgId],
    enabled: Boolean(orgId),
    queryFn: () =>
      axios
        .get<{ keys: ICustomerKmsKey[] }>(`/api/admin/byok-kms/keys/${orgId}`)
        .then((r) => r.data.keys),
  });

  const rotationQuery = useQuery({
    queryKey: ['admin', 'byok-kms', 'rotation-due', orgId],
    enabled: Boolean(orgId),
    queryFn: () =>
      axios
        .get<{
          due: Array<{ key: ICustomerKmsKey; daysRemaining: number | null }>;
          count: number;
        }>(`/api/admin/byok-kms/rotation-due/${orgId}`)
        .then((r) => r.data),
  });

  const register = useMutation({
    mutationFn: () =>
      axios.post<ICustomerKmsKey>('/api/admin/byok-kms/keys', {
        organizationId: orgId,
        alias: alias.trim(),
        provider,
        keyId: keyId.trim(),
        keyVersion: keyVersion.trim() || null,
        createdBy: createdBy.trim(),
      }),
    onSuccess: () => {
      setAlias('');
      setKeyId('');
      setKeyVersion('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'byok-kms'] });
      toast.success('Customer master key registered');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disable = useMutation({
    mutationFn: (k: ICustomerKmsKey) =>
      axios.delete<{ disabled: boolean }>(
        `/api/admin/byok-kms/keys/${k.organizationId}/${k.alias}`
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'byok-kms'] });
      toast.success('Key disabled');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const encrypt = useMutation({
    mutationFn: () =>
      axios.post<{ envelope: Record<string, unknown>; ciphertextRef: string }>(
        '/api/admin/byok-kms/encrypt',
        {
          organizationId: orgId,
          alias: alias.trim(),
          plaintext,
        }
      ),
    onSuccess: (res) => {
      setEnvelopeJson(JSON.stringify(res.data.envelope, null, 2));
      setCiphertextRef(res.data.ciphertextRef);
      toast.success('Encrypted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const decrypt = useMutation({
    mutationFn: () => {
      const envelope = JSON.parse(envelopeJson) as Record<string, unknown>;
      return axios.post<{ plaintext: string }>('/api/admin/byok-kms/decrypt', {
        organizationId: orgId,
        alias: alias.trim(),
        envelope,
        ciphertextRef,
      });
    },
    onSuccess: (res) => {
      setDecryptedOutput(res.data.plaintext);
      toast.success('Decrypted');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const keys = keysQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">BYOK · KMS</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage customer master keys, rotate them on schedule, and round-trip plaintext
          through envelope encryption. Master key material is resolved by{' '}
          <code>IMasterKeyProvider</code> (Local by default; swap in cloud deployments).
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Target organization</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="org_xxx"
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Register customer master key</CardTitle>
            <CardDescription>
              The <code>keyId</code> is the upstream KMS identifier (AWS KMS ARN, GCP key id,
              etc.). <code>keyVersion</code> is optional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Alias</Label>
                <Input
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="prod-east-2026"
                />
              </div>
              <div className="space-y-1">
                <Label>Provider</Label>
                <Select value={provider} onValueChange={(v) => setProvider(v as KmsProvider)}>
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>keyId</Label>
                <Input
                  value={keyId}
                  onChange={(e) => setKeyId(e.target.value)}
                  placeholder="arn:aws:kms:…"
                />
              </div>
              <div className="space-y-1">
                <Label>keyVersion (optional)</Label>
                <Input
                  value={keyVersion}
                  onChange={(e) => setKeyVersion(e.target.value)}
                  placeholder="v1"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>createdBy</Label>
              <Input value={createdBy} onChange={(e) => setCreatedBy(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button
                disabled={
                  !orgId || !alias.trim() || !keyId.trim() || register.isPending
                }
                onClick={() => register.mutate()}
              >
                Register key
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Round-trip encrypt</CardTitle>
            <CardDescription>
              Encrypt plaintext under <code>{alias || '<alias>'}</code>. The envelope + ciphertext
              blob can be passed back to /decrypt for verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label>Plaintext</Label>
              <Textarea
                rows={3}
                value={plaintext}
                onChange={(e) => setPlaintext(e.target.value)}
                placeholder="my secret value"
              />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={!orgId || !alias.trim() || !plaintext || encrypt.isPending}
                onClick={() => encrypt.mutate()}
              >
                Encrypt
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!envelopeJson || !ciphertextRef || decrypt.isPending}
                onClick={() => decrypt.mutate()}
              >
                Decrypt
              </Button>
            </div>
            {envelopeJson && (
              <div className="space-y-1">
                <Label>Envelope (JSON)</Label>
                <Textarea
                  rows={4}
                  value={envelopeJson}
                  onChange={(e) => setEnvelopeJson(e.target.value)}
                />
                <Label>ciphertextRef (base64)</Label>
                <Input
                  value={ciphertextRef}
                  onChange={(e) => setCiphertextRef(e.target.value)}
                />
              </div>
            )}
            {decryptedOutput && (
              <div className="space-y-1">
                <Label>Decrypted output</Label>
                <Input value={decryptedOutput} readOnly />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Customer master keys ({keys.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {!orgId ? (
            <div className="text-sm text-muted-foreground">Enter an org id above.</div>
          ) : keysQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : keys.length === 0 ? (
            <div className="text-sm text-muted-foreground">No keys for this org.</div>
          ) : (
            <div className="space-y-2">
              {keys.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center justify-between rounded border p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{k.alias}</span>
                      <Badge variant="outline">{k.provider}</Badge>
                      <Badge variant={k.status === 'enabled' ? 'secondary' : 'outline'}>
                        {k.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      keyId: <code>{k.keyId}</code>
                      {k.keyVersion && (
                        <>
                          {' '}· version: <code>{k.keyVersion}</code>
                        </>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={k.status !== 'enabled' || disable.isPending}
                    onClick={() => disable.mutate(k)}
                  >
                    Disable
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Rotation due ({rotationQuery.data?.count ?? 0})</CardTitle>
          <CardDescription>Keys whose rotation policy has elapsed.</CardDescription>
        </CardHeader>
        <CardContent>
          {rotationQuery.data?.due?.length ? (
            <ul className="space-y-1 text-sm">
              {rotationQuery.data.due.map(({ key, daysRemaining }) => (
                <li key={key.id} className="flex items-center justify-between">
                  <span>
                    <code>{key.alias}</code> · {key.provider}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {daysRemaining === null ? 'overdue' : `${daysRemaining}d left`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">No keys due for rotation.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
