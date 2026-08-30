/**
 * Teable Open Source — AGPL-3.0 license.
 *
 * Admin page route for /admin/audit-log — R1-T03 frontend bridge.
 *
 * Mirrors the SSR/auth shape used by /admin/setting:
 *   - `ensureLogin` redirects unauthenticated callers
 *   - `withAuthSSR` rejects 401 → redirect, 403 → ForbiddenError
 *   - `ForbiddenError` is thrown when the signed-in user isn't an admin
 *
 * The SSR pre-renders an empty `initialRows`; the client-side `useQuery`
 * inside `AuditLogPage` then takes over. Pre-rendering the list during SSR
 * is intentionally skipped here — audit rows can contain caller PII, and
 * SSR-serializing them into the page payload would leak that PII through
 * the response HTML.
 */
import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { AuditLogPage } from '@/features/app/blocks/admin';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

const AuditLog: NextPageWithLayout = () => <AuditLogPage />;

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

AuditLog.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default AuditLog;
