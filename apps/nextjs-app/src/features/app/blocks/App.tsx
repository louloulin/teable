import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
import { useBase, useBasePermission } from '@teable/sdk/hooks';
import {
  Alert,
  AlertDescription,
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  Textarea,
} from '@teable/ui-lib';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { useEffect } from 'react';
import { useState } from 'react';
import { useChatPanelStore } from '@/features/app/components/sidebar/useChatPanelStore';

type BuilderProposalStatus = 'draft' | 'approved' | 'rejected' | 'applied';

interface IBuilderProposalRow {
  id: string;
  baseId: string;
  status: BuilderProposalStatus;
  sourcePrompt: string;
  proposalJson: string;
  proposalHash: string;
  model: string;
  createdBy: string;
  createdTime: string;
  approvedBy: string | null;
  approvedTime: string | null;
  appliedResourceId: string | null;
}

const statusColor: Record<BuilderProposalStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'outline',
  approved: 'secondary',
  rejected: 'destructive',
  applied: 'default',
};

export function AppPage() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const base = useBase();
  const permission = useBasePermission();
  const queryClient = useQueryClient();
  const openChatPanel = useChatPanelStore((s) => s.open);
  useEffect(() => {
    openChatPanel();
    return () => useChatPanelStore.getState().close();
  }, [openChatPanel]);
  const [prompt, setPrompt] = useState('');
  const [rejectTarget, setRejectTarget] = useState<IBuilderProposalRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const baseId = String(router.query.baseId ?? base?.id ?? '');
  const canConfigure = Boolean(permission?.['base|update']);

  const proposals = useQuery({
    queryKey: ['ai-builder-proposals', baseId],
    enabled: Boolean(baseId && canConfigure),
    queryFn: () =>
      axios
        .get<IBuilderProposalRow[]>(`/api/${baseId}/ai-builder/proposals`)
        .then(({ data }) => data),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['ai-builder-proposals', baseId] });

  const create = useMutation({
    mutationFn: () =>
      axios.post<IBuilderProposalRow>(`/api/${baseId}/ai-builder/proposals`, {
        sourcePrompt: prompt.trim(),
      }),
    onSuccess: () => {
      setPrompt('');
      invalidate();
      toast.success('Proposal created');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: (proposalId: string) =>
      axios.post<IBuilderProposalRow>(
        `/api/${baseId}/ai-builder/proposals/${proposalId}/approve`
      ),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: ({ proposalId, reason }: { proposalId: string; reason: string }) =>
      axios.post<IBuilderProposalRow>(
        `/api/${baseId}/ai-builder/proposals/${proposalId}/reject`,
        { reason }
      ),
    onSuccess: () => {
      setRejectTarget(null);
      setRejectReason('');
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = useMutation({
    mutationFn: (proposalId: string) =>
      axios.post<IBuilderProposalRow>(
        `/api/${baseId}/ai-builder/proposals/${proposalId}/apply`
      ),
    onSuccess: (res) => {
      invalidate();
      toast.success(`Applied · resourceId=${res.data.appliedResourceId ?? 'n/a'}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!baseId) {
    return (
      <div className="flex-1 p-8 text-sm text-muted-foreground">Select a base first.</div>
    );
  }

  if (!canConfigure) {
    return (
      <div className="flex-1 p-8 text-sm text-destructive">
        You do not have permission to configure this base.
      </div>
    );
  }

  if (proposals.isLoading) {
    return (
      <div className="flex-1 space-y-4 overflow-y-auto p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (proposals.isError) {
    return (
      <div className="flex-1 p-8 text-sm text-destructive">
        Unable to load App Builder proposals.
      </div>
    );
  }

  const rows = proposals.data ?? [];

  return (
    <div className="flex h-full flex-1 flex-col gap-6 overflow-y-auto p-4 sm:p-8">
      <Head>
        <title>App Builder</title>
      </Head>

      <div>
        <h2 className="text-3xl font-bold tracking-tight">App Builder</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Translate a natural-language prompt into a schema proposal. Review, then approve to apply.
        </p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>New proposal</CardTitle>
          <CardDescription>
            Describe the table / field / view you want. The model returns a JSON proposal you can edit before applying.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Label htmlFor="ai-builder-prompt">Prompt</Label>
          <Textarea
            id="ai-builder-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A tasks table with title, status (todo/doing/done), priority, and due date"
            rows={3}
            maxLength={4000}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{prompt.length}/4000</span>
            <Button
              disabled={prompt.trim().length < 3 || create.isPending}
              onClick={() => void create.mutate()}
            >
              {create.isPending ? 'Generating…' : 'Generate proposal'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Proposals ({rows.length})</h3>
        </div>

        {rows.length === 0 ? (
          <Alert>
            <AlertDescription>No proposals yet — submit a prompt above.</AlertDescription>
          </Alert>
        ) : (
          rows.map((row) => {
            const isExpanded = expandedId === row.id;
            let parsed: unknown = null;
            try {
              parsed = JSON.parse(row.proposalJson);
            } catch {
              parsed = row.proposalJson;
            }
            return (
              <Card key={row.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {String((parsed as { title?: string })?.title ?? row.id)}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {String((parsed as { rationale?: string })?.rationale ?? row.sourcePrompt)}
                    </CardDescription>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Badge variant={statusColor[row.status]}>{row.status}</Badge>
                      <Badge variant="outline">model: {row.model}</Badge>
                      <Badge variant="outline">hash: {row.proposalHash.slice(0, 8)}</Badge>
                      <Badge variant="outline">
                        {new Date(row.createdTime).toLocaleString()}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                    >
                      {isExpanded ? 'Hide JSON' : 'View JSON'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        approve.isPending ||
                        row.status === 'approved' ||
                        row.status === 'applied' ||
                        row.status === 'rejected'
                      }
                      onClick={() => void approve.mutate(row.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reject.isPending || row.status === 'applied'}
                      onClick={() => setRejectTarget(row)}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={apply.isPending || row.status !== 'approved'}
                      onClick={() => void apply.mutate(row.id)}
                    >
                      Apply
                    </Button>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent>
                    <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
                      {JSON.stringify(parsed, null, 2)}
                    </pre>
                  </CardContent>
                )}
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={Boolean(rejectTarget)} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject proposal</DialogTitle>
            <DialogDescription>
              Optional reason — stored on the proposal row for later review.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor="reject-reason">Reason</Label>
          <Input
            id="reject-reason"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. wrong field type, missing columns"
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectTarget || reject.isPending}
              onClick={() =>
                rejectTarget &&
                void reject.mutate({ proposalId: rejectTarget.id, reason: rejectReason.trim() })
              }
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
