import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { EnterprisePlaceholderPage } from '@/features/app/blocks/admin';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

const AiCostAdminPage: NextPageWithLayout = () => (
  <EnterprisePlaceholderPage
    title="AI Cost Forecaster"
    description="Per-org AI token spend, burn-rate and budget alerts."
    cloudCapability="Cloud §admin-panel/ai-cost"
    ossBackend="GET /api/ai-cost-forecaster/spend"
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

AiCostAdminPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default AiCostAdminPage;
