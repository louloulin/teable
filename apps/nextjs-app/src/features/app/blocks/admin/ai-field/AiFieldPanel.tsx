/**
 * V26 — AI Field admin panel (Cloud §field/ai/ai-field).
 *
 * Surfaces the AiFieldController endpoints so admins can:
 *   1. List AI Field configs by (baseId, tableId)
 *   2. Create a new AI Field (operation: classify | summarize | translate)
 *   3. Pause/resume an AI Field
 *   4. Delete an AI Field
 *
 * Real LLM execution is intentionally a follow-up — current `runs` endpoint
 * stores the row but uses the caller-provided `stubOutput`. The actual
 * provider call (via aiGatewayBaseUrl + MiniMax) is wired in a future V.
 *
 * License: AGPL-3.0
 */

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
  Textarea,
} from '@teable/ui-lib';
import { Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';

type AiOp = 'summarize' | 'classify' | 'translate' | 'score' | 'image';
type AiStatus = 'enabled' | 'paused' | 'error';

interface IAiField {
  id: string;
  baseId: string;
  tableId: string;
  fieldId: string;
  operation: AiOp;
  model: string;
  sourceFieldIds: string;
  status: AiStatus;
  lastRunAt: string | null;
  createdTime: string;
}

interface IAiGenerationTask {
  id: string;
  baseId: string;
  tableId: string;
  trigger: string;
  status: 'waiting' | 'processing' | 'done' | 'failed' | 'cancelled' | string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  cancelRequested: boolean;
  lastError: string | null;
  startedTime: string | null;
  finishedTime: string | null;
  createdTime: string;
}

const OP_LABEL: Record<AiOp, string> = {
  summarize: '总结 (Summarize)',
  classify: '智能分类 (Classify)',
  translate: '翻译 (Translate)',
  score: '评分 (Score)',
  image: '图片生成 (Image)',
};

export const AiFieldPanel = () => {
  const queryClient = useQueryClient();
  const [baseId, setBaseId] = useState('');
  const [tableId, setTableId] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [sourceFieldId, setSourceFieldId] = useState('');
  const [operation, setOperation] = useState<AiOp>('summarize');
  const [model, setModel] = useState('MiniMax-M3');
  const [configJson, setConfigJson] = useState('{"maxLength":80,"style":"concise"}');

  const list = useQuery({
    queryKey: ['admin', 'ai-field', baseId, tableId],
    queryFn: async () => {
      const r = await axios.get<IAiField[]>('/admin/ai-field', { params: { baseId, tableId } });
      return r.data;
    },
    enabled: !!baseId && !!tableId,
  });

  const create = useMutation({
    mutationFn: () =>
      axios.post<IAiField>('/admin/ai-field', {
        baseId,
        tableId,
        fieldId,
        operation,
        model,
        sourceFieldIds: [sourceFieldId],
        config: JSON.parse(configJson),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ai-field', baseId, tableId] });
    },
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AiStatus }) =>
      axios.patch(`/admin/ai-field/${id}`, { status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ai-field', baseId, tableId] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => axios.delete(`/admin/ai-field/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ai-field', baseId, tableId] });
    },
  });

  const startBatch = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: 'fill-empty' | 'entire-column' }) =>
      axios.post<{ taskId: string }>(`/admin/ai-field/${id}/batch`, { mode }),
  });

  const batchTasks = useQuery({
    queryKey: ['admin', 'ai-field', 'batch-tasks', baseId, tableId],
    queryFn: async () => {
      if (!list.data || list.data.length === 0) return [] as IAiGenerationTask[];
      const all: IAiGenerationTask[] = [];
      for (const f of list.data) {
        try {
          const r = await axios.get<IAiGenerationTask[]>(`/admin/ai-field/${f.id}/batch/tasks?limit=3`);
          all.push(...r.data);
        } catch {
          /* skip */
        }
      }
      return all.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
    },
    enabled: !!baseId && !!tableId,
    refetchInterval: 5000,
  });

  const cancelTask = useMutation({
    mutationFn: (taskId: string) => axios.post(`/admin/ai-field/batch/tasks/${taskId}/cancel`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'ai-field', 'batch-tasks', baseId, tableId] });
    },
  });

  return (
    <div className="flex flex-col gap-4 p-6" data-testid="ai-field-panel">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> AI Field (Cloud §field/ai/ai-field)
          </CardTitle>
          <CardDescription className="text-xs">
            Configure per-field AI generation: summarize / classify / translate / score / image.
            Provider is set via the AI Gateway (admin/ai-setting/gateway); default model
            MiniMax-M3 routes through https://api.minimaxi.com/v1.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-xs">Base ID</Label>
            <Input
              value={baseId}
              onChange={(e) => setBaseId(e.target.value)}
              placeholder="bse_xxx"
              className="font-mono"
              data-testid="ai-field-base-id"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Table ID</Label>
            <Input
              value={tableId}
              onChange={(e) => setTableId(e.target.value)}
              placeholder="tbl_xxx"
              className="font-mono"
              data-testid="ai-field-table-id"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Target field ID</Label>
            <Input
              value={fieldId}
              onChange={(e) => setFieldId(e.target.value)}
              placeholder="fld_xxx"
              className="font-mono"
              data-testid="ai-field-target-field"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Source field ID</Label>
            <Input
              value={sourceFieldId}
              onChange={(e) => setSourceFieldId(e.target.value)}
              placeholder="fld_xxx"
              className="font-mono"
              data-testid="ai-field-source-field"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Operation</Label>
            <Select value={operation} onValueChange={(v) => setOperation(v as AiOp)}>
              <SelectTrigger data-testid="ai-field-operation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(OP_LABEL) as AiOp[]).map((op) => (
                  <SelectItem key={op} value={op}>
                    {OP_LABEL[op]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Model</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="MiniMax-M3"
              className="font-mono"
              data-testid="ai-field-model"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-xs">Config JSON</Label>
            <Textarea
              value={configJson}
              onChange={(e) => setConfigJson(e.target.value)}
              placeholder='{"maxLength":80,"style":"concise"}'
              className="font-mono text-xs"
              rows={3}
              data-testid="ai-field-config"
            />
          </div>
          <div className="col-span-2 flex justify-end">
            <Button
              size="sm"
              disabled={
                !baseId ||
                !tableId ||
                !fieldId ||
                !sourceFieldId ||
                !model ||
                create.isPending
              }
              onClick={() => create.mutate()}
              data-testid="ai-field-create"
            >
              <Sparkles className="mr-1 h-3 w-3" /> Create AI field
            </Button>
          </div>
          {create.error && (
            <div className="col-span-2 text-xs text-red-600">
              {(create.error as Error).message}
            </div>
          )}
        </CardContent>
      </Card>

      {baseId && tableId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              Configured AI fields ({list.data?.length ?? 0})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(list.data ?? []).map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between border-b py-2 text-sm"
                data-testid={`ai-field-row-${f.id}`}
              >
                <span className="font-mono">{f.id.slice(0, 16)}</span>
                <Badge variant="outline">{OP_LABEL[f.operation] ?? f.operation}</Badge>
                <span className="font-mono text-xs">{f.model}</span>
                <Badge variant={f.status === 'enabled' ? 'secondary' : 'destructive'}>
                  {f.status}
                </Badge>
                <span className="flex-1 truncate pl-2 text-xs text-muted-foreground">
                  {f.fieldId}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={f.status === 'paused' || setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: f.id, status: 'paused' })}
                >
                  Pause
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={f.status === 'enabled' || setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: f.id, status: 'enabled' })}
                >
                  Resume
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={f.status !== 'enabled' || startBatch.isPending}
                  onClick={() => startBatch.mutate({ id: f.id, mode: 'fill-empty' })}
                  data-testid={`ai-field-fill-${f.id}`}
                >
                  Fill empty
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={f.status !== 'enabled' || startBatch.isPending}
                  onClick={() => startBatch.mutate({ id: f.id, mode: 'entire-column' })}
                  data-testid={`ai-field-column-${f.id}`}
                >
                  Column
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(f.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {(batchTasks.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Batch tasks ({(batchTasks.data ?? []).length})</CardTitle>
            <CardDescription className="text-xs">
              {startBatch.data && (
                <span data-testid="ai-field-batch-result">
                  Latest task: <span className="font-mono">{startBatch.data.data.taskId}</span>
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(batchTasks.data ?? []).map((t) => {
              const pct =
                t.totalCount > 0
                  ? Math.round(((t.completedCount + t.failedCount) / t.totalCount) * 100)
                  : 0;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between border-b py-2 text-xs"
                  data-testid={`ai-field-task-${t.id}`}
                >
                  <span className="font-mono">{t.id.slice(0, 18)}</span>
                  <Badge variant="outline">{t.trigger}</Badge>
                  <Badge
                    variant={
                      t.status === 'done'
                        ? 'secondary'
                        : t.status === 'failed' || t.status === 'cancelled'
                        ? 'destructive'
                        : 'default'
                    }
                  >
                    {t.status}
                  </Badge>
                  <span className="font-mono">
                    {t.completedCount}/{t.totalCount} ({pct}%)
                  </span>
                  {t.failedCount > 0 && (
                    <span className="text-red-600">{t.failedCount} failed</span>
                  )}
                  {(t.status === 'waiting' || t.status === 'processing') && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cancelTask.isPending}
                      onClick={() => cancelTask.mutate(t.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
