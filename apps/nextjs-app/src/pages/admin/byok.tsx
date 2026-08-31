import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import type { ReactElement } from 'react';
import { useState } from 'react';
import {
  ByokKmsPanel,
  ByokLlmPanel,
} from '@/features/app/blocks/admin/byok';
import { Button } from '@teable/ui-lib';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

const ByokAdminPage: NextPageWithLayout = () => {
  const router = useRouter();
  const [tab, setTab] = useState<'llm' | 'kms'>(
    router.query.tab === 'kms' ? 'kms' : 'llm'
  );
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex gap-2 border-b px-6 py-3">
        <Button
          variant={tab === 'llm' ? 'secondary' : 'ghost'}
          onClick={() => setTab('llm')}
        >
          LLM keys
        </Button>
        <Button
          variant={tab === 'kms' ? 'secondary' : 'ghost'}
          onClick={() => setTab('kms')}
        >
          Customer master keys
        </Button>
      </div>
      {tab === 'llm' ? <ByokLlmPanel /> : <ByokKmsPanel />}
    </div>
  );
};

export const getServerSideProps: GetServerSideProps = withEnv(
  ensureLogin(
    withAuthSSR(async (context, ssrApi) => {
      const userMe = await ssrApi.getUserMe();
      if (!userMe?.isAdmin) throw new ForbiddenError();
      return { props: { ...(await getTranslationsProps(context, 'common')) } };
    })
  )
);

ByokAdminPage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default ByokAdminPage;
