import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { EnterprisePlaceholderPage } from '@/features/app/blocks/admin';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

const QuotaAdminPage: NextPageWithLayout = () => (
  <EnterprisePlaceholderPage
    title="Quota"
    description="Plan, row and seat quota tuning per space. Hard limits on a space id."
    cloudCapability="Cloud §admin-panel/quota"
    ossBackend="PATCH /api/space/:spaceId/quota"
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

QuotaAdminPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default QuotaAdminPage;
