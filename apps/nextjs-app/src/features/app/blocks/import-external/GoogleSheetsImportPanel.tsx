import { FileSpreadsheet } from '@teable/icons';
import { Button, cn, Input, Label } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { spaceConfig } from '@/features/i18n/space.config';

interface IGoogleSheetsImportPanelProps {
  className?: string;
}

/**
 * Minimal Google Sheets import entry. The Airtable pipeline accepts both
 * integrationId and accessToken, but Google Sheets has no Airtable-equivalent
 * backend yet — we surface the UI shell (URL input + "Coming soon" affordance)
 * so the admin nav can advertise the feature without lying about a working
 * import. Until a sheets-import service is added, the panel submits the URL
 * via a no-op client stub and toasts a placeholder so the form is still
 * testable.
 */
export const GoogleSheetsImportPanel = (props: IGoogleSheetsImportPanelProps) => {
  const { className } = props;
  const { t } = useTranslation(spaceConfig.i18nNamespaces);
  const [url, setUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      // Placeholder: would call `importGoogleSheetsAnalyze({ url })` once the
      // sheets-import backend exists. For now we surface the limitation in the
      // UI so an admin who tries the flow sees an honest message.
      await new Promise((resolve) => setTimeout(resolve, 200));
      toast.warning(t('space:sheetsImport.notImplemented'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm', className)}>
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <FileSpreadsheet className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">{t('space:sheetsImport.title')}</div>
          <div className="truncate text-xs text-muted-foreground">
            {t('space:sheetsImport.description')}
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="google-sheets-url">{t('space:sheetsImport.urlLabel')}</Label>
        <Input
          id="google-sheets-url"
          type="url"
          inputMode="url"
          spellCheck={false}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t('space:sheetsImport.urlPlaceholder')}
        />
        <p className="text-xs text-muted-foreground">{t('space:sheetsImport.urlHelp')}</p>
      </div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={busy || !url.trim()}>
          {busy ? t('common:actions.loading') : t('space:sheetsImport.continue')}
        </Button>
      </div>
    </div>
  );
};
