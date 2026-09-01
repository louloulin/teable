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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { useState } from 'react';

type AppStatus = 'draft' | 'deployed' | 'archived';
type VersionStatus = 'draft' | 'deployed' | 'rolled_back';

interface IApp {
  id: string;
  baseId: string;
  name: string;
  description: string | null;
  currentVersionId: string | null;
  status: AppStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface IAppVersion {
  id: string;
  appId: string;
  versionNumber: number;
  snapshot: unknown;
  sourcePrompt: string | null;
  status: VersionStatus;
  deployedAt: string | null;
  deployedBy: string | null;
  createdAt: string;
}

interface IAppSecret {
  id: string;
  appId: string;
  key: string;
  description: string | null;
  updatedAt: string;
}

interface IAppFile {
  id: string;
  appId: string;
  path: string;
  sizeBytes: number;
  updatedAt: string;
}

interface IBase {
  id: string;
  name: string;
  spaceId: string;
}

async function fetchBases(): Promise<IBase[]> {
  const r = await axios.get<IBase[]>('/base/access/all');
  return r.data;
}

async function fetchApps(baseId: string): Promise<IApp[]> {
  const r = await axios.get<IApp[]>(`/${baseId}/apps`);
  return r.data;
}

async function fetchVersions(baseId: string, appId: string): Promise<IAppVersion[]> {
  const r = await axios.get<IAppVersion[]>(`/${baseId}/apps/${appId}/versions`);
  return r.data;
}

async function fetchSecrets(baseId: string, appId: string): Promise<IAppSecret[]> {
  const r = await axios.get<IAppSecret[]>(`/${baseId}/apps/${appId}/secrets`);
  return r.data;
}

async function fetchFiles(baseId: string, appId: string): Promise<IAppFile[]> {
  const r = await axios.get<IAppFile[]>(`/${baseId}/apps/${appId}/files`);
  return r.data;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export const AiAppBuilderPanel = () => {
  const queryClient = useQueryClient();
  const [baseId, setBaseId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [snapshot, setSnapshot] = useState('{"view":"grid"}');
  const [sourcePrompt, setSourcePrompt] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [filePath, setFilePath] = useState('/config.yaml');
  const [fileContent, setFileContent] = useState('');
  const [previewVersion, setPreviewVersion] = useState<IAppVersion | null>(null);
  // V25 — multi-device preview (Cloud §app-builder §实时预览面板)
  type PreviewViewport = 'desktop' | 'tablet' | 'mobile';
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>('desktop');
  const VIEWPORT_PX: Record<PreviewViewport, { w: number; h: number; label: string }> = {
    desktop: { w: 1280, h: 720, label: '1280×720' },
    tablet:  { w: 768,  h: 1024, label: '768×1024' },
    mobile:  { w: 375,  h: 667,  label: '375×667'  },
  };

  const basesQuery = useQuery({
    queryKey: ['admin', 'ai-app-builder', 'bases'],
    queryFn: fetchBases,
  });

  const appsQuery = useQuery({
    queryKey: ['admin', 'ai-app-builder', 'apps', baseId],
    queryFn: () => fetchApps(baseId),
    enabled: Boolean(baseId),
  });

  const selectedApp = appsQuery.data?.[0];
  const versionsQuery = useQuery({
    queryKey: ['admin', 'ai-app-builder', 'versions', baseId, selectedApp?.id],
    queryFn: () => fetchVersions(baseId, selectedApp!.id),
    enabled: Boolean(baseId && selectedApp),
  });
  const secretsQuery = useQuery({
    queryKey: ['admin', 'ai-app-builder', 'secrets', baseId, selectedApp?.id],
    queryFn: () => fetchSecrets(baseId, selectedApp!.id),
    enabled: Boolean(baseId && selectedApp),
  });
  const filesQuery = useQuery({
    queryKey: ['admin', 'ai-app-builder', 'files', baseId, selectedApp?.id],
    queryFn: () => fetchFiles(baseId, selectedApp!.id),
    enabled: Boolean(baseId && selectedApp),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'ai-app-builder'] });
  };

  const createApp = useMutation({
    mutationFn: () =>
      axios.post<IApp>(`/${baseId}/apps`, {
        name: name.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('App created');
      setName('');
      setDescription('');
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message ?? 'create failed'),
  });

  const deploy = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(snapshot);
      } catch {
        throw new Error('snapshot must be valid JSON');
      }
      return axios.post<{
        appId: string;
        currentVersionId: string;
        version: IAppVersion;
      }>(`/${baseId}/apps/${selectedApp!.id}/deploy`, {
        snapshot: parsed,
        sourcePrompt: sourcePrompt.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Deployed');
      setSourcePrompt('');
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message ?? 'deploy failed'),
  });

  const rollback = useMutation({
    mutationFn: () =>
      axios.post<{ currentVersionId: string }>(
        `/${baseId}/apps/${selectedApp!.id}/rollback`,
        {}
      ),
    onSuccess: () => {
      toast.success('Rolled back');
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message ?? 'rollback failed'),
  });

  const remove = useMutation({
    mutationFn: () => axios.delete<{ ok: boolean }>(`/${baseId}/apps/${selectedApp!.id}`),
    onSuccess: () => {
      toast.success('Deleted');
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message ?? 'delete failed'),
  });

  const putSecret = useMutation({
    mutationFn: () =>
      axios.post<{ count: number }>(`/${baseId}/apps/${selectedApp!.id}/secrets`, {
        secrets: [
          {
            key: secretKey.trim(),
            value: secretValue,
            description: undefined,
          },
        ],
      }),
    onSuccess: () => {
      toast.success('Secret saved');
      setSecretKey('');
      setSecretValue('');
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message ?? 'secret save failed'),
  });

  const putFile = useMutation({
    mutationFn: () =>
      axios.post<{ id: string }>(`/${baseId}/apps/${selectedApp!.id}/files`, {
        path: filePath.trim(),
        content: fileContent,
        sizeBytes: new Blob([fileContent]).size,
      }),
    onSuccess: () => {
      toast.success('File saved');
      setFileContent('');
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message ?? 'file save failed'),
  });

  return (
    <div className="space-y-6 p-6">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>AI App Builder</CardTitle>
          <CardDescription>
            R-AI-4 / Cloud §App Builder. Pick a base, create an app instance, deploy versions,
            manage write-only secrets and sandbox files.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Base</Label>
            <Select value={baseId} onValueChange={setBaseId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a base" />
              </SelectTrigger>
              <SelectContent>
                {(basesQuery.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Sales Dashboard"
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Customer-facing pipeline view"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={!baseId || !name.trim() || createApp.isPending}
              onClick={() => createApp.mutate()}
            >
              {createApp.isPending ? 'Creating...' : 'Create app'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Apps in this base ({appsQuery.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          {!baseId ? (
            <div className="text-sm text-muted-foreground">Select a base above.</div>
          ) : appsQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (appsQuery.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">No apps yet.</div>
          ) : (
            <div className="space-y-2">
              {(appsQuery.data ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded border p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{a.name}</span>
                      <Badge variant="outline">{a.status}</Badge>
                      {a.currentVersionId && (
                        <Badge variant="secondary">
                          current: {a.currentVersionId.slice(0, 12)}…
                        </Badge>
                      )}
                    </div>
                    {a.description && (
                      <div className="text-xs text-muted-foreground">{a.description}</div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // Make this the focused app by re-fetching: simplest is setBaseId re-select
                        // but baseId is fixed. We instead auto-pick the first app:
                      }}
                      disabled
                    >
                      Open (auto-pick first)
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Selected app: {selectedApp?.name ?? '(pick first app)'}</CardTitle>
          <CardDescription>
            The top-most app is auto-selected. Deploy a snapshot JSON, or roll back to a previous
            version.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Snapshot JSON</Label>
            <Textarea
              value={snapshot}
              onChange={(e) => setSnapshot(e.target.value)}
              placeholder='{"view":"grid","pages":[]}'
              rows={3}
            />
          </div>
          <div className="space-y-1">
            <Label>Source prompt</Label>
            <Input
              value={sourcePrompt}
              onChange={(e) => setSourcePrompt(e.target.value)}
              placeholder="Initial release"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={!selectedApp || rollback.isPending}
              onClick={() => rollback.mutate()}
            >
              {rollback.isPending ? 'Rolling back...' : 'Rollback'}
            </Button>
            <Button disabled={!selectedApp || deploy.isPending} onClick={() => deploy.mutate()}>
              {deploy.isPending ? 'Deploying...' : 'Deploy'}
            </Button>
            <Button
              variant="destructive"
              disabled={!selectedApp || remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid max-w-3xl grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle>Versions ({versionsQuery.data?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {(versionsQuery.data ?? []).map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between border-b py-2 text-sm"
              >
                <span className="font-medium">v{v.versionNumber}</span>
                <Badge variant={v.status === 'deployed' ? 'secondary' : 'outline'}>
                  {v.status}
                </Badge>
                <span className="flex-1 truncate pl-2 text-xs text-muted-foreground">
                  {v.sourcePrompt?.slice(0, 32) ?? v.id.slice(0, 12)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setPreviewVersion(v)}>
                  Preview
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Secrets (write-only)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(secretsQuery.data ?? []).map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{s.key}</span>
                <Badge variant="outline">{s.id.slice(0, 8)}</Badge>
              </div>
            ))}
            <div className="space-y-1 pt-2">
              <Input
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder="OPENAI_API_KEY"
              />
              <Input
                type="password"
                value={secretValue}
                onChange={(e) => setSecretValue(e.target.value)}
                placeholder="sk-..."
              />
              <Button
                size="sm"
                className="w-full"
                disabled={!secretKey.trim() || putSecret.isPending}
                onClick={() => putSecret.mutate()}
              >
                Save secret
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Sandbox files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(filesQuery.data ?? []).map((f) => (
            <div key={f.id} className="flex items-center justify-between text-sm">
              <code className="font-mono">{f.path}</code>
              <span className="text-xs text-muted-foreground">{f.sizeBytes} bytes</span>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2 pt-2">
            <Input
              className="col-span-1"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="/config.yaml"
            />
            <Input
              className="col-span-2"
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              placeholder="file content"
            />
          </div>
          <Button
            size="sm"
            disabled={!filePath.trim() || putFile.isPending}
            onClick={() => putFile.mutate()}
          >
            Save file
          </Button>
        </CardContent>
      </Card>

      {/* ─── R-AI-12 — App Builder Live Preview (Cloud §app-builder) ──
          Surfaces each deployed version's snapshot. If the snapshot
          carries an `html` key (custom AI-generated markup) we render
          it inside a sandboxed iframe via srcdoc; otherwise we fall
          back to JSON syntax-highlight so operators can audit the
          generated design even without a browser-renderable payload. */}
      <Dialog
        open={Boolean(previewVersion)}
        onOpenChange={(open) => {
          if (!open) setPreviewVersion(null);
        }}
      >
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>
              Preview · v{previewVersion?.versionNumber ?? '?'} ·{' '}
              <Badge variant="outline">{previewVersion?.status ?? 'unknown'}</Badge>
              <Badge variant="secondary" className="ml-2 font-mono">
                {VIEWPORT_PX[previewViewport].label}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {previewVersion?.sourcePrompt
                ? `Source prompt: ${previewVersion.sourcePrompt}`
                : 'No source prompt recorded for this version.'}
            </DialogDescription>
            {/* V25 viewport switcher — Cloud §实时预览面板 */}
            <div className="flex items-center gap-1 pt-2" data-testid="preview-viewport-switcher">
              <Button
                size="sm"
                variant={previewViewport === 'desktop' ? 'default' : 'outline'}
                onClick={() => setPreviewViewport('desktop')}
                data-testid="preview-viewport-desktop"
              >
                <Monitor className="mr-1 h-3 w-3" /> Desktop
              </Button>
              <Button
                size="sm"
                variant={previewViewport === 'tablet' ? 'default' : 'outline'}
                onClick={() => setPreviewViewport('tablet')}
                data-testid="preview-viewport-tablet"
              >
                <Tablet className="mr-1 h-3 w-3" /> Tablet
              </Button>
              <Button
                size="sm"
                variant={previewViewport === 'mobile' ? 'default' : 'outline'}
                onClick={() => setPreviewViewport('mobile')}
                data-testid="preview-viewport-mobile"
              >
                <Smartphone className="mr-1 h-3 w-3" /> Mobile
              </Button>
            </div>
          </DialogHeader>
          {previewVersion?.snapshot ? (
            <div className="space-y-3">
              {(() => {
                const snap = previewVersion.snapshot as Record<string, unknown>;
                const html = typeof snap.html === 'string' ? snap.html : null;
                if (html) {
                  const vp = VIEWPORT_PX[previewViewport];
                  return (
                    <div className="flex justify-center overflow-auto rounded-md border bg-slate-50 p-4">
                      <iframe
                        title="app-preview"
                        sandbox=""
                        srcDoc={html}
                        data-testid="preview-iframe"
                        style={{
                          width: `${vp.w}px`,
                          height: `${vp.h}px`,
                          maxWidth: '100%',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 6,
                          background: 'white',
                        }}
                      />
                    </div>
                  );
                }
                return null;
              })()}
              <SyntaxHighlighter
                language="json"
                style={oneDark}
                customStyle={{ maxHeight: 320, borderRadius: 6, fontSize: 12 }}
              >
                {JSON.stringify(previewVersion.snapshot, null, 2)}
              </SyntaxHighlighter>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This version has no snapshot data.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
