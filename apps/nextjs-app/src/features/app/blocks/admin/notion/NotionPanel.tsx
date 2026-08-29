import { FileText } from '@teable/icons';
import { notionDisconnect } from '@teable/openapi';
import { Button, cn } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { Unlink } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { spaceConfig } from '@/features/i18n/space.config';
import { ConnectButton } from './ConnectButton';
import { DatabasePicker } from './DatabasePicker';
import { ImportButton } from './ImportButton';

interface INotionPanelProps {
  spaceId: string;
  /** Optional className for the outer container. */
  className?: string;
}

interface IConnectionState {
  connected: boolean;
  workspaceName: string | null;
  databaseId: string | null;
  tableId: string;
}

/**
 * Notion import admin panel. Composes the connect button, the database
 * picker, and the import button into a single card. The connection state
 * is held locally — the wizard is short-lived so we don't need to
 * re-fetch the connect status on mount (callers can refresh by remounting).
 */
export const NotionPanel = (props: INotionPanelProps) => {
  const { spaceId, className } = props;
  const { t } = useTranslation(spaceConfig.i18nNamespaces);
  const [state, setState] = React.useState<IConnectionState>({
    connected: false,
    workspaceName: null,
    databaseId: null,
    tableId: '',
  });

  const onConnected = React.useCallback((workspaceName: string) => {
    setState((prev) => ({ ...prev, connected: true, workspaceName }));
  }, []);

  const onPickDatabase = React.useCallback((databaseId: string) => {
    setState((prev) => ({ ...prev, databaseId }));
  }, []);

  const onImported = React.useCallback((imported: number, _skipped: number) => {
    // Keep the import summary local — the parent can read it via the same
    // callback if it wants to update its own counters.
    void imported;
  }, []);

  const onDisconnect = React.useCallback(async () => {
    if (!spaceId) return;
    if (!window.confirm(t('common:admin.notion.disconnectConfirm'))) return;
    try {
      await notionDisconnect({ spaceId });
      setState({
        connected: false,
        workspaceName: null,
        databaseId: null,
        tableId: '',
      });
      toast.success(t('common:admin.notion.disconnected'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Disconnect failed';
      toast.error(message);
    }
  }, [spaceId, t]);

  return (
    <div className={cn('flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm', className)}>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <FileText className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-medium">{t('common:admin.notion.title')}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {state.connected && state.workspaceName
                ? t('common:admin.notion.connected', { workspace: state.workspaceName })
                : t('common:admin.notion.disconnected')}
            </p>
          </div>
        </div>
        {state.connected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDisconnect}
            className="gap-2"
          >
            <Unlink className="size-4" />
            {t('common:admin.notion.disconnect')}
          </Button>
        ) : (
          <ConnectButton spaceId={spaceId} onConnected={onConnected} variant="default" />
        )}
      </header>

      {state.connected && (
        <div className="flex flex-col gap-4">
          <DatabasePicker spaceId={spaceId} value={state.databaseId} onChange={onPickDatabase} />
          <ImportButton
            spaceId={spaceId}
            databaseId={state.databaseId ?? ''}
            tableId={state.tableId}
            onImported={onImported}
            disabled={!state.databaseId}
          />
        </div>
      )}
    </div>
  );
};
