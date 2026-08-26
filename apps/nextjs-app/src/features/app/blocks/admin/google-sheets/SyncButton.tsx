import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IGoogleSheetsSyncRo } from '@teable/openapi';
import { syncGoogleSheets } from '@teable/openapi';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { RotateCw } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';

type TDirection = 'import' | 'export' | 'both';

interface ISyncButtonProps {
  spaceId: string;
  spreadsheetId: string;
  tableId: string;
  sheetName: string;
}

/**
 * Sync action control — T-15 Wave 10.
 *
 * Posts the chosen `direction` (import / export / both) to
 * POST /admin/google-sheets/sync. The server returns the rolled-up
 * counts + diff summary; we surface inserted/updated/deleted as
 * a success toast so the admin sees what happened without having
 * to refresh the status query.
 */
export const SyncButton = (props: ISyncButtonProps) => {
  const { spaceId, spreadsheetId, tableId, sheetName } = props;
  const { t } = useTranslation('common');
  const [direction, setDirection] = useState<TDirection>('both');
  const queryClient = useQueryClient();

  const ready = Boolean(spaceId && spreadsheetId && tableId && sheetName);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (ro: IGoogleSheetsSyncRo) => syncGoogleSheets(ro).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'google-sheets', 'status'] });
      const summary = `${data.counts.inserted} / ${data.counts.updated} / ${data.counts.deleted}`;
      toast.success(t('admin.googleSheets.syncSuccess', { counts: summary }));
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : t('admin.googleSheets.syncError'));
    },
  });

  const onSync = () => {
    if (!ready) return;
    void mutateAsync({ spaceId, spreadsheetId, tableId, sheetName, direction });
  };

  return (
    <div className="flex items-center gap-2">
      <Select value={direction} onValueChange={(v) => setDirection(v as TDirection)}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="both">{t('admin.googleSheets.sync')}</SelectItem>
          <SelectItem value="import">{t('admin.googleSheets.importLabel')}</SelectItem>
          <SelectItem value="export">{t('admin.googleSheets.exportLabel')}</SelectItem>
        </SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={!ready || isPending} onClick={onSync}>
        <RotateCw className={`mr-1 size-3.5 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? t('admin.googleSheets.syncInProgress') : t('admin.googleSheets.sync')}
      </Button>
    </div>
  );
};
