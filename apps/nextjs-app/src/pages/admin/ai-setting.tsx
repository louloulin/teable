import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ISettingVo, IUpdateAppConfigRo, IUpdateAiConfigRo } from '@teable/openapi';
import { getSetting, updateAiConfig, updateAppConfig } from '@teable/openapi';
import {
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
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { AIConfigFormWizard } from '@/features/app/blocks/admin';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

interface IAISettingPageProps {
  settingServerData?: ISettingVo;
}

const AISettingPage: NextPageWithLayout<IAISettingPageProps> = ({ settingServerData }) => {
  const { t } = useTranslation('common');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: setting = settingServerData } = useQuery({
    queryKey: ['setting'],
    queryFn: () => getSetting().then(({ data }) => data),
  });
  const [vercelToken, setVercelToken] = useState('');
  const [deployProvider, setDeployProvider] = useState<'vercel' | 'docker-runtime'>('vercel');

  useEffect(() => {
    if (setting?.appConfig) {
      setVercelToken(setting.appConfig.vercelToken ?? '');
      setDeployProvider(setting.appConfig.deployProvider ?? 'vercel');
    }
  }, [setting?.appConfig]);

  const { mutateAsync: saveAiConfig, isPending: isSavingAi } = useMutation({
    mutationFn: (payload: IUpdateAiConfigRo) => updateAiConfig(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['setting'] });
    },
  });
  const { mutateAsync: saveAppConfig, isPending: isSavingApp } = useMutation({
    mutationFn: (payload: IUpdateAppConfigRo) => updateAppConfig(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['setting'] });
    },
  });

  const anchor = typeof router.query.anchor === 'string' ? router.query.anchor : 'llm';

  if (!setting) return null;

  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">{t('admin.setting.ai.title', 'AI settings')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('admin.setting.ai.description', 'Configure AI providers, models, and App Builder.')}
        </p>
      </div>
      <div className="mb-6 flex gap-2 border-b pb-3">
        <Button
          type="button"
          variant={anchor === 'app' ? 'outline' : 'default'}
          onClick={() =>
            void router.push({ pathname: '/admin/ai-setting', query: { anchor: 'llm' } })
          }
        >
          {t('admin.setting.ai.llmTab', 'AI models')}
        </Button>
        <Button
          type="button"
          variant={anchor === 'app' ? 'default' : 'outline'}
          onClick={() =>
            void router.push({ pathname: '/admin/ai-setting', query: { anchor: 'app' } })
          }
        >
          {t('admin.setting.ai.appTab', 'App Builder')}
        </Button>
      </div>
      {anchor === 'app' ? (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>{t('admin.configuration.list.appBuilderEngine.title')}</CardTitle>
            <CardDescription>
              {t(
                'admin.setting.ai.appBuilderDescription',
                'Choose where published apps are deployed.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="app-deploy-provider">
                {t('admin.setting.ai.deployProvider', 'Deploy provider')}
              </Label>
              <Select
                value={deployProvider}
                onValueChange={(value) => setDeployProvider(value as typeof deployProvider)}
              >
                <SelectTrigger id="app-deploy-provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vercel">Vercel</SelectItem>
                  <SelectItem value="docker-runtime">Docker runtime</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="vercel-token">
                {t('admin.setting.ai.vercelToken', 'Vercel token')}
              </Label>
              <Input
                id="vercel-token"
                type="password"
                autoComplete="off"
                value={vercelToken}
                onChange={(event) => setVercelToken(event.target.value)}
                disabled={deployProvider !== 'vercel'}
              />
            </div>
            <Button
              type="button"
              disabled={isSavingApp}
              onClick={() =>
                void saveAppConfig({
                  section: 'engine',
                  patch: {
                    deployProvider,
                    vercelToken: deployProvider === 'vercel' ? vercelToken || null : null,
                  },
                })
              }
            >
              {isSavingApp ? t('actions.saving', 'Saving…') : t('actions.save')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <AIConfigFormWizard
          aiConfig={setting.aiConfig}
          onSaveAiConfig={async (payload) => saveAiConfig(payload)}
        />
      )}
      {isSavingAi && <span className="sr-only">{t('actions.saving', 'Saving…')}</span>}
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = withEnv(
  ensureLogin(
    withAuthSSR<IAISettingPageProps>(async (context, ssrApi) => {
      const userMe = await ssrApi.getUserMe();
      if (!userMe?.isAdmin) throw new ForbiddenError();
      return {
        props: {
          settingServerData: await ssrApi.getSetting(),
          ...(await getTranslationsProps(context, 'common')),
        },
      };
    })
  )
);

AISettingPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default AISettingPage;
