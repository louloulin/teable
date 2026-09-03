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
  Checkbox,
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

type CustomAiProvider =
  | 'custom-openai'
  | 'custom-anthropic'
  | 'custom-azure'
  | 'custom-ollama'
  | 'custom-bedrock';

interface ICustomAiModel {
  id: string;
  provider: string;
  alias: string;
  baseUrl?: string;
  modelName: string;
  imageGenerationModel: boolean;
  status: string;
  isolation: string;
  createdAt: string;
}

interface ICustomAiModelTestResult {
  ok: boolean;
  capabilities?: { chat: boolean; vision: boolean; imageGeneration: boolean };
  message?: string;
}

const PROVIDERS: ReadonlyArray<CustomAiProvider> = [
  'custom-openai',
  'custom-anthropic',
  'custom-azure',
  'custom-ollama',
  'custom-bedrock',
];

export const CustomAiModelPanel = () => {
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState('org_default');
  const [provider, setProvider] = useState<CustomAiProvider>('custom-openai');
  const [alias, setAlias] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [imageGenerationModel, setImageGenerationModel] = useState(false);

  const modelsQuery = useQuery({
    queryKey: ['admin', 'custom-ai-model', 'models', orgId],
    queryFn: () =>
      axios
        .get<{
          models: ICustomAiModel[];
          count: number;
        }>(`/api/custom-ai-model/models?orgId=${orgId}`)
        .then((r) => r.data),
    enabled: Boolean(orgId),
  });

  const create = useMutation({
    mutationFn: () =>
      axios.post<ICustomAiModel>('/api/custom-ai-model/models', {
        orgId,
        provider,
        alias: alias.trim(),
        baseUrl: baseUrl.trim() || undefined,
        modelName: modelName.trim(),
        apiKey: apiKey.trim() || undefined,
        imageGenerationModel,
      }),
    onSuccess: () => {
      setAlias('');
      setBaseUrl('');
      setModelName('');
      setApiKey('');
      setImageGenerationModel(false);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'custom-ai-model'] });
      toast.success('Custom model registered');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/custom-ai-model/models/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'custom-ai-model'] });
      toast.success('Model removed');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const test = useMutation({
    mutationFn: (id: string) =>
      axios.post<ICustomAiModelTestResult>(`/api/custom-ai-model/models/${id}/test`),
    onSuccess: (res) => {
      const ok = res.data.ok ?? false;
      toast.success(ok ? 'Test passed' : 'Test failed');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const batchTest = useMutation({
    mutationFn: () =>
      axios.post<{
        results: Array<ICustomAiModelTestResult & { modelId: string; alias: string }>;
      }>('/api/custom-ai-model/models/batch-test', undefined, { params: { orgId } }),
    onSuccess: (res) => {
      const passed = res.data.results.filter((result) => result.ok).length;
      toast.success(`Capability test complete: ${passed}/${res.data.results.length} reachable`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const models = modelsQuery.data?.models ?? [];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Custom AI Models</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect your own OpenAI/Anthropic/Azure/Ollama endpoints so the AI gateway can route
          traffic without exposing secrets.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Target organization</CardTitle>
        </CardHeader>
        <CardContent>
          <Input value={orgId} onChange={(e) => setOrgId(e.target.value)} />
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Register a custom model</CardTitle>
          <CardDescription>
            API keys are stored as ciphertext envelopes in <code>byok_llm_key</code>; only the
            fingerprint is shown in the UI.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as CustomAiProvider)}>
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
              <Label>Alias</Label>
              <Input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="e.g. internal-gpt"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Base URL (optional)</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </div>
            <div className="space-y-1">
              <Label>Model name</Label>
              <Input
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="gpt-5-mini"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>API key (optional)</Label>
            <Input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="custom-image-generation-model"
              checked={imageGenerationModel}
              onCheckedChange={(checked) => setImageGenerationModel(checked === true)}
            />
            <Label htmlFor="custom-image-generation-model" className="cursor-pointer">
              Image generation model
            </Label>
          </div>
          <div className="flex justify-end">
            <Button
              disabled={!alias.trim() || !modelName.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? 'Registering...' : 'Register model'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>Registered models ({models.length})</CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={batchTest.isPending || models.length === 0}
              onClick={() => batchTest.mutate()}
            >
              {batchTest.isPending ? 'Testing all...' : 'Test all capabilities'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {modelsQuery.isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : models.length === 0 ? (
            <div className="text-sm text-muted-foreground">No custom models yet.</div>
          ) : (
            <div className="space-y-2">
              {models.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded border p-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.alias}</span>
                      <Badge variant="outline">{m.provider}</Badge>
                      <Badge variant={m.status === 'active' ? 'secondary' : 'outline'}>
                        {m.status}
                      </Badge>
                      {m.imageGenerationModel && <Badge variant="outline">Image Gen</Badge>}
                    </div>
                    {test.data?.data && test.variables === m.id && (
                      <div className="flex gap-1 text-xs text-muted-foreground">
                        <Badge
                          variant={test.data.data.capabilities?.chat ? 'secondary' : 'outline'}
                        >
                          Chat
                        </Badge>
                        <Badge
                          variant={test.data.data.capabilities?.vision ? 'secondary' : 'outline'}
                        >
                          Vision
                        </Badge>
                        <Badge
                          variant={
                            test.data.data.capabilities?.imageGeneration ? 'secondary' : 'outline'
                          }
                        >
                          Image Gen
                        </Badge>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      model: <code>{m.modelName}</code>
                      {m.baseUrl && (
                        <>
                          {' '}
                          * base: <code>{m.baseUrl}</code>
                        </>
                      )}{' '}
                      * isolation: {m.isolation}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={test.isPending}
                      onClick={() => test.mutate(m.id)}
                    >
                      {test.isPending && test.variables === m.id ? 'Testing...' : 'Test'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(m.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
