import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { AdminSkillsPage } from '@/features/app/blocks/admin/skills';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

const SkillsPage: NextPageWithLayout = () => <AdminSkillsPage />;
SkillsPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};
export const getServerSideProps: GetServerSideProps = withEnv(
  ensureLogin(
    withAuthSSR(async (context, ssrApi) => {
      if (!(await ssrApi.getUserMe())?.isAdmin) throw new ForbiddenError();
      return { props: {} };
    })
  )
);
export default SkillsPage;
