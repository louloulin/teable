import { Download, Loader2 } from '@teable/icons';
import { importNotionDatabase } from '@teable/openapi';
import { Button, Input, Label, cn } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useTranslation } from 'next-i18next';
import React from 'react';

interface IImportButtonProps {
  spaceId: string;
  databaseId: string;
  tableId: string;
  /** Called after a successful import so the parent can refresh state. */
  onImported?: (imported: number, skipped: number) => void;
  disabled?: boolean;
  className?: string;
}

interface IImportState {
  busy: boolean;
}

/**
 * Triggers the Notion → Teable import. Shows the target base/table inputs
 * inline so the wizard can stay one-component-deep. The call delegates to
 * the openapi client which posts to `/api/admin/notion/import`.
 */
export const ImportButton = (props: IImportButtonProps) => {
  const { spaceId, databaseId, tableId, onImported, disabled, className } = props;
  const { t } = useTranslation(['common', 'space']);
  const [state, setState] = React.useState<IImportState>({ busy: false });
  const [localTableId, setLocalTableId] = React.useState(tableId);

  // Sync the local table id when the parent changes it (e.g. after a
  // re-mount or a successful import that rotates the target).
  React.useEffect(() => {
    setLocalTableId(tableId);
  }, [tableId]);

  const canSubmit = !!spaceId && !!databaseId && !!localTableId && !state.busy && !disabled;

  const onClick = async () => {
    if (!canSubmit) return;
    setState({ busy: true });
    try {
      const { data } = await importNotionDatabase({
        spaceId,
        tableId: localTableId,
        databaseId,
      });
      onImported?.(data.imported, data.skipped);
      toast.success(
        t('common:admin.notion.importSuccess', {
          imported: data.imported,
          skipped: data.skipped,
        })
      );
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : t('common:admin.notion.importError');
      toast.error(message);
    } finally {
      setState({ busy: false });
    }
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="notion-target-base">{t('common:admin.notion.targetBase')}</Label>
          <Input
            id="notion-target-base"
            value={spaceId}
            readOnly
            disabled
            placeholder={t('common:admin.notion.targetBase')}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="notion-target-table">{t('common:admin.notion.targetTable')}</Label>
          <Input
            id="notion-target-table"
            value={localTableId}
            onChange={(event) => setLocalTableId(event.target.value)}
            placeholder={t('common:admin.notion.targetTable')}
            disabled={disabled || state.busy}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={onClick}
          disabled={!canSubmit}
          className="gap-2"
        >
          {state.busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {state.busy ? t('common:admin.notion.importing') : t('common:admin.notion.import')}
        </Button>
      </div>
    </div>
  );
};
