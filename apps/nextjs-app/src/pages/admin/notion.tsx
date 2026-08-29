import { useQuery } from '@tanstack/react-query';
import { getSpaceList } from '@teable/openapi';
import { Label } from '@teable/ui-lib/shadcn';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import type { ReactElement } from 'react';
import { NotionPanel } from '@/features/app/blocks/admin/notion';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import { spaceConfig } from '@/features/i18n/space.config';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

/**
 * Notion import admin page.
 *
 * Renders the `NotionPanel` against the first space the admin can access.
 * The wizard is space-scoped, so a `spaceId` must be resolved before the
 * panel can render — same pattern as `AdminImportPage`.
 */
const AdminNotionPage: NextPageWithLayout = () => {
  const { t } = useTranslation(spaceConfig.i18nNamespaces);
  const router = useRouter();
  const { data: spaceList } = useQuery({
    queryKey: ['space-list'],
    queryFn: () => getSpaceList().then(({ data }) => data),
  });
  const defaultSpaceId = spaceList?.[0]?.id ?? '';

  if (!defaultSpaceId) {
    return (
      <div className="flex h-screen flex-1 flex-col overflow-y-auto p-4 sm:p-8">
        <h1 className="text-2xl font-semibold">{t('common:admin.notion.title')}</h1>
        <p className="mt-4 text-sm text-amber-600">
          <Label>{t('space:adminImport.noSpace')}</Label>
        </p>
        <button
          type="button"
          onClick={() => router.push({ pathname: '/space' })}
          className="mt-4 self-start rounded border bg-card px-3 py-1 text-sm"
        >
          {t('common:actions.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">{t('common:admin.notion.title')}</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <NotionPanel spaceId={defaultSpaceId} />
      </div>
    </div>
  );
};

export const getServerSideProps = withEnv(
  ensureLogin(
    withAuthSSR(async (context, ssrApi) => {
      const userMe = await ssrApi.getUserMe();

      if (!userMe?.isAdmin) {
        throw new ForbiddenError();
      }

      return {
        props: {
          ...(await getTranslationsProps(context, ['common', 'space'])),
        },
      };
    })
  )
);

AdminNotionPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default AdminNotionPage;
