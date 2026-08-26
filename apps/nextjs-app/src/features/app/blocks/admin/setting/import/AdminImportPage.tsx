import { useQuery } from '@tanstack/react-query';
import { Airtable } from '@teable/icons';
import { getSpaceList, UserIntegrationProvider } from '@teable/openapi';
import { Button, Label } from '@teable/ui-lib/shadcn';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React from 'react';
import {
  AirtableImportWizard,
  GoogleSheetsImportPanel,
} from '@/features/app/blocks/import-external';
import { usePublicSettingQuery } from '@/features/app/hooks/useSetting';
import { spaceConfig } from '@/features/i18n/space.config';

/**
 * Admin entry for external imports. Shows the two supported sources (Airtable,
 * Google Sheets) as cards and opens the Airtable wizard in a dialog. Google
 * Sheets is rendered as a small URL-input panel since it has no working
 * importer yet — see GoogleSheetsImportPanel for the placeholder behavior.
 */
export const AdminImportPage = () => {
  const { t } = useTranslation(spaceConfig.i18nNamespaces);
  const router = useRouter();
  const [airtableOpen, setAirtableOpen] = React.useState(false);

  const { data: publicSetting } = usePublicSettingQuery();
  const airtableImportEnabled = !!publicSetting?.availableIntegrationProviders?.includes(
    UserIntegrationProvider.Airtable
  );

  // The wizard requires a spaceId; on admin/import the user has not picked a
  // target yet, so we default to the first space the admin has rights to.
  const { data: spaceList } = useQuery({
    queryKey: ['space-list'],
    queryFn: () => getSpaceList().then(({ data }) => data),
  });
  const defaultSpaceId = spaceList?.[0]?.id ?? '';

  const onOpenAirtable = () => {
    if (!defaultSpaceId) {
      router.push({ pathname: '/space' });
      return;
    }
    setAirtableOpen(true);
  };

  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">{t('space:adminImport.title')}</h1>
        <div className="mt-2 text-sm text-muted-foreground">
          {t('space:adminImport.description')}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Airtable className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">{t('space:airtableImport.title')}</div>
              <div className="text-xs text-muted-foreground">
                {t('space:adminImport.airtableDescription')}
              </div>
            </div>
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            <li>· {t('space:airtableImport.optionRecords')}</li>
            <li>· {t('space:airtableImport.optionAttachments')}</li>
            <li>· {t('space:adminImport.airtableStepConnect')}</li>
          </ul>
          <div className="flex justify-end">
            <Button onClick={onOpenAirtable} disabled={!airtableImportEnabled || !defaultSpaceId}>
              {t('space:adminImport.open')}
            </Button>
          </div>
          {!airtableImportEnabled && (
            <p className="text-xs text-muted-foreground">
              {t('space:airtableImport.integrationRequired')}
            </p>
          )}
        </div>

        <GoogleSheetsImportPanel />

        {!defaultSpaceId && (
          <p className="text-xs text-amber-600 sm:col-span-2">
            <Label>{t('space:adminImport.noSpace')}</Label>
          </p>
        )}
      </div>

      {airtableOpen && defaultSpaceId && (
        <AirtableImportWizard
          spaceId={defaultSpaceId}
          open={airtableOpen}
          onOpenChange={setAirtableOpen}
        />
      )}
    </div>
  );
};
