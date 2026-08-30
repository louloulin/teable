import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axios } from '@teable/openapi';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@teable/ui-lib/shadcn';
import type { GetServerSideProps } from 'next';
import type { ReactElement } from 'react';
import { useState } from 'react';
import { AdminLayout } from '@/features/app/layouts/AdminLayout';
import ensureLogin from '@/lib/ensureLogin';
import { getTranslationsProps } from '@/lib/i18n';
import type { NextPageWithLayout } from '@/lib/type';
import withAuthSSR, { ForbiddenError } from '@/lib/withAuthSSR';
import withEnv from '@/lib/withEnv';

interface ILicenseState {
  instanceId: string;
  licenseKey: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  plan: string | null;
  source: string;
}

const LicensePage: NextPageWithLayout = () => {
  const queryClient = useQueryClient();
  const [licenseKey, setLicenseKey] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['license-state'],
    queryFn: () => axios.get<ILicenseState>('/license/state').then((response) => response.data),
  });
  const activate = useMutation({
    mutationFn: () => axios.post('/license/activate', { licenseKey }),
    onSuccess: () => {
      setLicenseKey('');
      void queryClient.invalidateQueries({ queryKey: ['license-state'] });
      void queryClient.invalidateQueries({ queryKey: ['license-capabilities'] });
    },
  });
  const deactivate = useMutation({
    mutationFn: () => axios.post('/license/deactivate'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['license-state'] });
      void queryClient.invalidateQueries({ queryKey: ['license-capabilities'] });
    },
  });

  return (
    <div className="flex h-screen flex-1 flex-col overflow-y-auto p-4 sm:p-8">
      <div className="pb-6">
        <h1 className="text-2xl font-semibold">License</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Activate an optional license for plan-specific limits. Self-hosted instances work without
          one.
        </p>
      </div>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Instance license</CardTitle>
          <CardDescription>License keys are never rendered after activation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading license state…</p>
          ) : (
            <div className="grid gap-2 rounded-md border p-4 text-sm sm:grid-cols-2">
              <span className="text-muted-foreground">Plan</span>
              <span>{data?.plan ?? 'self_hosted'}</span>
              <span className="text-muted-foreground">Source</span>
              <span>{data?.source ?? 'none'}</span>
              <span className="text-muted-foreground">Instance ID</span>
              <span className="break-all font-mono text-xs">{data?.instanceId ?? '—'}</span>
              <span className="text-muted-foreground">Expires</span>
              <span>{data?.expiresAt ?? 'Never'}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="license-key">License key</Label>
            <Input
              id="license-key"
              type="password"
              value={licenseKey}
              onChange={(event) => setLicenseKey(event.target.value)}
              placeholder="plan:pro or signed license JWT"
              autoComplete="off"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void activate.mutateAsync()}
              disabled={!licenseKey.trim() || activate.isPending}
            >
              Activate
            </Button>
            <Button
              variant="outline"
              onClick={() => void deactivate.mutateAsync()}
              disabled={deactivate.isPending || data?.source === 'none'}
            >
              Deactivate
            </Button>
          </div>
          {(activate.isError || deactivate.isError) && (
            <p className="text-sm text-destructive">
              License operation failed. Check the key and server logs.
            </p>
          )}
        </CardContent>
      </Card>
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

LicensePage.getLayout = function getLayout(page: ReactElement, pageProps) {
  return <AdminLayout {...pageProps}>{page}</AdminLayout>;
};

export default LicensePage;
