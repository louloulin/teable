import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  IDeadLetterWebhookDeliveryVo,
  IListDeadLetterWebhookDeliveriesVo,
  IRetryWebhookDeliveryVo,
} from '@teable/openapi';
import { listDeadLetterWebhookDeliveries, retryWebhookDelivery } from '@teable/openapi';
import { Button, Skeleton } from '@teable/ui-lib/shadcn';
import { ConfirmDialog } from '@teable/ui-lib/base';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { RotateCw } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

type IDeadLetterRow = IDeadLetterWebhookDeliveryVo;

/**
 * DeadLetterPanel — renders the table of dead-letter rows and the
 * "重新投递" / "Retry" button per row.
 *
 * Listing: sourced from a small admin openapi endpoint (defined
 * alongside `retryWebhookDelivery`); the panel reads `rows[]` and
 * renders one row per delivery with a per-row retry button.
 *
 * Retry: calls `retryWebhookDelivery(id)` — a `POST` that creates a
 * fresh attempt and leaves the original `dead` row intact. On success
 * the panel toasts the new attempt id and invalidates the listing.
 *
 * Confirm: the click goes through `ConfirmDialog` so a misclick never
 * silently re-queues a delivery.
 *
 * The panel is intentionally a controlled subtree of the admin layout
 * — it does not own the page chrome or routing.
 */
export const DeadLetterPanel = () => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [confirmRow, setConfirmRow] = useState<IDeadLetterRow | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin', 'webhook', 'dead-letter'],
    queryFn: () =>
      listDeadLetterWebhookDeliveries().then(
        (r) => r.data as IListDeadLetterWebhookDeliveriesVo
      ),
  });

  const { mutateAsync: retry, isPending } = useMutation({
    mutationFn: async (id: string) => {
      const res = await retryWebhookDelivery(id);
      return res.data as IRetryWebhookDeliveryVo;
    },
    onSuccess: (data) => {
      toast.success(
        t('admin.webhook.deadLetter.retry.success', { attemptId: data.attemptId })
      );
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'webhook', 'dead-letter'],
      });
    },
    onError: (err: Error) => {
      toast.error(
        t('admin.webhook.deadLetter.retry.error', {
          message: err.message ?? 'unknown error',
        })
      );
    },
    onSettled: () => {
      setConfirmRow(null);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-3/4" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
        {t('admin.webhook.deadLetter.loadError')}
      </div>
    );
  }

  const rows = data?.rows ?? [];

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        {t('admin.webhook.deadLetter.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="grid grid-cols-12 gap-2 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
          <div className="col-span-3">{t('admin.webhook.deadLetter.headers.id')}</div>
          <div className="col-span-3">{t('admin.webhook.deadLetter.headers.endpoint')}</div>
          <div className="col-span-2">{t('admin.webhook.deadLetter.headers.attempts')}</div>
          <div className="col-span-2">{t('admin.webhook.deadLetter.headers.lastError')}</div>
          <div className="col-span-2 text-right">
            {t('admin.webhook.deadLetter.headers.actions')}
          </div>
        </div>
        <ul>
          {rows.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-12 gap-2 border-b px-4 py-3 text-xs last:border-b-0"
            >
              <div className="col-span-3 truncate font-mono text-muted-foreground">{row.id}</div>
              <div className="col-span-3 truncate font-mono text-muted-foreground">
                {row.endpointId}
              </div>
              <div className="col-span-2 text-muted-foreground">
                {row.attempt}/{row.maxAttempts}
              </div>
              <div className="col-span-2 truncate text-muted-foreground">
                {row.lastError ?? row.lastStatusCode ?? '—'}
              </div>
              <div className="col-span-2 flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isPending && confirmRow?.id === row.id}
                  onClick={() => setConfirmRow(row)}
                >
                  <RotateCw className="mr-1 size-3.5" />
                  {t('admin.webhook.deadLetter.retry.button')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <button
        type="button"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        onClick={() => void refetch()}
      >
        {t('admin.webhook.deadLetter.refresh')}
      </button>

      <ConfirmDialog
        open={confirmRow !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRow(null);
        }}
        title={t('admin.webhook.deadLetter.retry.confirmTitle')}
        description={
          confirmRow
            ? t('admin.webhook.deadLetter.retry.confirm', { id: confirmRow.id })
            : ''
        }
        cancelText={t('common.actions.cancel')}
        confirmText={t('admin.webhook.deadLetter.retry.button')}
        onConfirm={() => {
          if (confirmRow) {
            void retry(confirmRow.id);
          }
        }}
      />
    </div>
  );
};