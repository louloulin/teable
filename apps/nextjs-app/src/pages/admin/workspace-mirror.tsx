import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { MirrorSettingsPanel } from '@/features/app/blocks/workspace-switcher';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

const WorkspaceMirrorPage: NextPageWithLayout = () => (
  <div className="flex h-screen flex-1 flex-col overflow-y-auto p-4 sm:p-8">
    <div className="pb-6">
      <h1 className="text-2xl font-semibold">Workspace mirror</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Configure standby regions, monitor replication lag, and pause or resume shipping.
      </p>
    </div>
    <MirrorSettingsPanel />
  </div>
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

WorkspaceMirrorPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default WorkspaceMirrorPage;
