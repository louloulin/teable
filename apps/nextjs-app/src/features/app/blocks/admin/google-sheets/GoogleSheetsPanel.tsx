import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IGoogleSheetsDisconnectVo, IGoogleSheetsStatusVo } from '@teable/openapi';
import { disconnectGoogleSheets, getGoogleSheetsStatus, getSpaceList } from '@teable/openapi';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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
} from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { PlugZap, Unplug } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { useEffect, useMemo, useState } from 'react';
import { ConnectButton } from './ConnectButton';
import { SyncButton } from './SyncButton';

/**
 * Google Sheets admin panel — T-15 Wave 10.
 *
 * Renders the OAuth connect CTA when the picked space has no
 * stored tokens; otherwise shows status (badge + last-bound
 * spreadsheet), a sync form (spreadsheet id + table id + sheet
 * name + direction picker) and a destructive disconnect button.
 *
 * The space picker defaults to the first space the admin has
 * rights to (same convention as the airtable admin page); for a
 * single-tenant / single-space deployment this is sufficient
 * and avoids forcing an empty state.
 */
export const GoogleSheetsPanel = () => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [spaceId, setSpaceId] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [tableId, setTableId] = useState('');
  const [sheetName, setSheetName] = useState('');

  const { data: spaceList } = useQuery({
    queryKey: ['space-list'],
    queryFn: () => getSpaceList().then((r) => r.data),
  });
  const spaceOptions = useMemo(() => spaceList ?? [], [spaceList]);
  useEffect(() => {
    if (!spaceId && spaceOptions.length > 0) {
      setSpaceId(spaceOptions[0]?.id ?? '');
    }
  }, [spaceId, spaceOptions]);

  const statusQuery = useQuery({
    queryKey: ['admin', 'google-sheets', 'status', spaceId],
    queryFn: () => getGoogleSheetsStatus(spaceId).then((r) => r.data as IGoogleSheetsStatusVo),
    enabled: Boolean(spaceId),
  });

  const status = statusQuery.data;
  const connected = !!status?.connected;
  const lastSpreadsheetId = status?.spreadsheetId ?? '';
  const lastSheetName = status?.sheetName ?? '';

  // Prefill the sync inputs with the last-bound spreadsheet so
  // admins don't have to re-type the id after each disconnect.
  useEffect(() => {
    if (lastSpreadsheetId && !spreadsheetId) setSpreadsheetId(lastSpreadsheetId);
    if (lastSheetName && !sheetName) setSheetName(lastSheetName);
  }, [lastSpreadsheetId, lastSheetName, spreadsheetId, sheetName]);

  const disconnectMutation = useMutation({
    mutationFn: () =>
      disconnectGoogleSheets(spaceId).then((r) => r.data as IGoogleSheetsDisconnectVo),
    onSuccess: () => {
      toast.success(t('admin.googleSheets.disconnected'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'google-sheets', 'status'] });
      setSpreadsheetId('');
      setSheetName('');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : t('admin.googleSheets.error.tokenExpired'));
    },
  });

  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">{t('admin.googleSheets.title')}</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          {connected ? t('admin.googleSheets.connected') : t('admin.googleSheets.disconnected')}
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('admin.googleSheets.title')}</CardTitle>
            <CardDescription>
              {connected ? t('admin.googleSheets.connected') : t('admin.googleSheets.disconnected')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="gs-space">{t('noun.space')}</Label>
              <Select value={spaceId} onValueChange={setSpaceId}>
                <SelectTrigger id="gs-space" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {spaceOptions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              {connected ? (
                <Badge variant="default">{t('admin.googleSheets.connected')}</Badge>
              ) : (
                <Badge variant="secondary">{t('admin.googleSheets.disconnected')}</Badge>
              )}
              {!connected && <ConnectButton spaceId={spaceId} />}
              {connected && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={!spaceId}>
                      <Unplug className="mr-1 size-3.5" />
                      {t('admin.googleSheets.disconnect')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('admin.googleSheets.disconnect')}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('admin.googleSheets.disconnectConfirm')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => disconnectMutation.mutate()}
                        disabled={disconnectMutation.isPending}
                      >
                        <PlugZap className="mr-1 size-3.5" />
                        {t('admin.googleSheets.disconnect')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('admin.googleSheets.sync')}</CardTitle>
            <CardDescription>{t('admin.googleSheets.sync')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="gs-spreadsheet">{t('admin.googleSheets.spreadsheetId')}</Label>
                <Input
                  id="gs-spreadsheet"
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                  placeholder={t('admin.googleSheets.spreadsheetId')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="gs-sheet">{t('admin.googleSheets.spreadsheetId')}</Label>
                <Input
                  id="gs-sheet"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="Sheet1"
                />
              </div>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="gs-table">{t('admin.googleSheets.tableId')}</Label>
                <Input
                  id="gs-table"
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  placeholder="tblXXXXXXXXXXXXXX"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <SyncButton
                spaceId={spaceId}
                spreadsheetId={spreadsheetId}
                tableId={tableId}
                sheetName={sheetName}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
