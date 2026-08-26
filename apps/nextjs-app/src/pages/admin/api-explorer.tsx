import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { ApiExplorerPage } from '@/features/app/blocks/admin';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

/**
 * Admin-only wrapper around the public Scalar-powered OpenAPI viewer that
 * the NestJS backend exposes at `GET /openapi/docs`. We render it inside an
 * `<iframe>` so this page works regardless of whether the Next.js app and
 * the NestJS backend are deployed on the same origin or on separate ones.
 *
 * The page itself is auth-gated (admin only), even though the iframe contents
 * are public; that keeps the entry point discoverable from the admin sidebar
 * without leaking it to anonymous visitors.
 */
const ApiExplorer: NextPageWithLayout = () => <ApiExplorerPage />;

export const getServerSideProps: GetServerSideProps = withEnv(
  ensureLogin(
    withAuthSSR(async (context, ssrApi) => {
      const userMe = await ssrApi.getUserMe();

      if (!userMe?.isAdmin) {
        throw new ForbiddenError();
      }

      return {
        props: {
          ...(await getTranslationsProps(context, 'common')),
        },
      };
    })
  )
);

ApiExplorer.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default ApiExplorer;
