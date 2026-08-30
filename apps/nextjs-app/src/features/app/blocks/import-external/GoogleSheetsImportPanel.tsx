import { FileSpreadsheet } from '@teable/icons';
import { Button, cn } from '@teable/ui-lib/shadcn';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React from 'react';
import { spaceConfig } from '@/features/i18n/space.config';

interface IGoogleSheetsImportPanelProps {
  className?: string;
}

/**
 * Entry point for the implemented Google Sheets OAuth and sync administration
 * flow. Importing is configured from the dedicated admin page.
 */
export const GoogleSheetsImportPanel = (props: IGoogleSheetsImportPanelProps) => {
  const { className } = props;
  const { t } = useTranslation(spaceConfig.i18nNamespaces);
  const router = useRouter();

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
      <div className="flex justify-end">
        <Button onClick={() => router.push('/admin/google-sheets')}>
          {t('space:sheetsImport.continue')}
        </Button>
      </div>
    </div>
  );
};
