import { useQuery } from '@tanstack/react-query';
import type { IScimConfigVo } from '@teable/openapi';
import { getScimConfig } from '@teable/openapi';
import { Input, Label, Skeleton } from '@teable/ui-lib/shadcn';
import { useTranslation } from 'next-i18next';
import { CopyButton } from '@/features/app/components/CopyButton';
import { useEnv } from '@/features/app/hooks/useEnv';
import { ScimGroupListTable } from './ScimGroupListTable';
import { ScimTokenPanel } from './ScimTokenPanel';
import { ScimUserListTable } from './ScimUserListTable';

export const ScimSettingsPage = () => {
  const { t } = useTranslation('common');
  const { publicOrigin } = useEnv();
  const { data: config, isLoading } = useQuery({
    queryKey: ['admin', 'scim', 'config'],
    queryFn: () => getScimConfig().then((r) => r.data as IScimConfigVo),
  });

  const endpoint = publicOrigin ? `${publicOrigin}/scim/v2` : '/scim/v2';

  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">{t('admin.scim.title')}</h1>
        <div className="mt-2 text-sm text-muted-foreground">{t('admin.scim.description')}</div>
      </div>

      <div className="space-y-6">
        <section className="space-y-4">
          <h2 className="text-lg font-medium">{t('admin.scim.endpoint.title')}</h2>
          <div className="rounded-lg border bg-card p-4 shadow-sm">
            <Label htmlFor="scim-endpoint">{t('admin.scim.endpoint.label')}</Label>
            <div className="mt-2 flex items-center gap-2">
              <Input
                id="scim-endpoint"
                readOnly
                value={endpoint}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <CopyButton size="sm" text={endpoint} label={t('admin.scim.endpoint.copy')} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t('admin.scim.endpoint.hint')}</p>
          </div>

          <ScimConnectionTest endpoint={endpoint} hasToken={!!config?.hasToken} />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium">{t('admin.scim.token.sectionTitle')}</h2>
          {isLoading ? <Skeleton className="h-24 w-full" /> : <ScimTokenPanel config={config} />}
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-medium">{t('admin.scim.users.title')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('admin.scim.users.total', { count: config?.userCount ?? 0 })}
            </span>
          </div>
          <ScimUserListTable />
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-medium">{t('admin.scim.groups.title')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('admin.scim.groups.total', { count: config?.groupCount ?? 0 })}
            </span>
          </div>
          <ScimGroupListTable />
        </section>
      </div>
    </div>
  );
};

const ScimConnectionTest = ({ endpoint, hasToken }: { endpoint: string; hasToken: boolean }) => {
  const { t } = useTranslation('common');
  const curlExample =
    `curl -X GET "${endpoint}/ServiceProviderConfig" \\${'\n'}` +
    `  -H "Authorization: Bearer <your-scim-token>"`;
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="text-sm font-medium">{t('admin.scim.connectionTest.title')}</div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('admin.scim.connectionTest.description')}
      </p>
      <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs leading-relaxed">
        <code>{curlExample}</code>
      </pre>
      {!hasToken && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          {t('admin.scim.connectionTest.noTokenWarning')}
        </p>
      )}
    </div>
  );
};
