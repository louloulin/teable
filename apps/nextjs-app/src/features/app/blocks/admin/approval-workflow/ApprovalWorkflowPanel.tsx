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

type ApprovalStrategy = 'any-one' | 'all' | 'majority' | 'sequential';
type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'expired';

interface IApprovalWorkflow {
  id: string;
  baseId: string;
  tableId: string;
  name: string;
  strategy: ApprovalStrategy;
  approverIds: string[];
  threshold?: number;
  expiresInHours?: number;
  createdTime: string;
  updatedTime: string;
}

interface IApprovalRequest {
  id: string;
  baseId: string;
  tableId: string;
  recordId: string;
  workflowId: string;
  requesterUserId: string;
  status: ApprovalStatus;
  approverIds: string[];
  createdTime: string;
  decidedAt?: string;
}

const STRATEGIES: ApprovalStrategy[] = ['any-one', 'all', 'majority', 'sequential'];
const STATUS_COLORS: Record<ApprovalStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
  expired: 'bg-gray-100 text-gray-800',
};

export const ApprovalWorkflowPanel = () => {
  const queryClient = useQueryClient();
  const [baseId, setBaseId] = useState('');
  const [tableId, setTableId] = useState('');
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState<ApprovalStrategy>('any-one');
  const [approverIds, setApproverIds] = useState('');

  const workflows = useQuery({
    queryKey: ['admin', 'approval-workflow', baseId],
    queryFn: () =>
      axios
        .get<{ workflows: IApprovalWorkflow[] }>(`/api/base/${baseId}/approval-workflow`)
        .then(({ data }) => data.workflows),
    enabled: !!baseId,
  });

  const create = useMutation({
    mutationFn: () =>
      axios
        .post<IApprovalWorkflow>(`/api/base/${baseId}/approval-workflow`, {
          tableId,
          name,
          strategy,
          approverIds: approverIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        })
        .then(({ data }) => data),
    onSuccess: () => {
      toast.success('Approval workflow created');
      setName('');
      setApproverIds('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'approval-workflow'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => axios.delete(`/api/approval-workflow/${id}`),
    onSuccess: () => {
      toast.success('Workflow deleted');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'approval-workflow'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Approval Workflows</CardTitle>
          <CardDescription>
            Cloud §审批流 — define reusable approval policies (which fields, which approvers, how
            many must sign).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Base ID</Label>
              <Input
                value={baseId}
                onChange={(e) => setBaseId(e.target.value)}
                placeholder="bse_xxx"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Table ID</Label>
              <Input
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                placeholder="tbl_xxx"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label>Workflow name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sales approval" />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Strategy</Label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as ApprovalStrategy)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Approver user IDs (comma separated)</Label>
            <Input
              value={approverIds}
              onChange={(e) => setApproverIds(e.target.value)}
              placeholder="usr_1, usr_2"
            />
          </div>
          <Button
            onClick={() => create.mutate()}
            disabled={!baseId || !tableId || !name || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create workflow'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Workflows</CardTitle>
          <CardDescription>Workflows for the selected base.</CardDescription>
        </CardHeader>
        <CardContent>
          {!baseId ? (
            <p className="text-sm text-muted-foreground">Enter a base ID to list workflows.</p>
          ) : workflows.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : workflows.data?.length ? (
            <div className="flex flex-col gap-2">
              {workflows.data.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between rounded border p-3"
                >
                  <div>
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {w.id} · {w.tableId} · {w.strategy} · approvers:{' '}
                      {w.approverIds.length}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(w.id)}
                    disabled={remove.isPending}
                  >
                    Delete
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No workflows found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
