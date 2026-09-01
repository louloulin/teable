import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { EnterprisePlaceholderPage } from '@/features/app/blocks/admin';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

const AirtableAdminPage: NextPageWithLayout = () => (
  <EnterprisePlaceholderPage
    title="Airtable Importer / Sync"
    description="Run a base import from an Airtable share and review sync state."
    cloudCapability="Cloud §admin-panel/airtable"
    ossBackend="POST /api/airtable-import/base"
  />
);

export const getServerSideProps: GetServerSideProps = withEnv(
  ensureLogin(
    withAuthSSR(async (context, ssrApi) => {
      const userMe = await ssrApi.getUserMe();
      if (!userMe?.isAdmin) throw new ForbiddenError();
      return { props: { ...(await getTranslationsProps(context, 'common')) } };
    })
  )
);

AirtableAdminPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default AirtableAdminPage;
