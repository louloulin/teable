import { useTranslation } from 'next-i18next';
import { CopyButton } from '@/features/app/components/CopyButton';
import { useEnv } from '@/features/app/hooks/useEnv';

const ATTRIBUTE_MAPPING = [
  {
    unified: 'email',
    saml: 'NameID (emailAddress) / Attribute mail',
    oidc: 'id_token.email',
  },
  {
    unified: 'name',
    saml: 'Attribute displayName',
    oidc: 'id_token.name',
  },
  {
    unified: 'groups',
    saml: 'Attribute memberOf / isMemberOf',
    oidc: 'id_token.groups',
  },
  {
    unified: 'email_verified',
    saml: '— (assumed true after NameID validation)',
    oidc: 'id_token.email_verified',
  },
] as const;

/**
 * Admin-settings panel that surfaces the SAML ↔ OIDC federation
 * metadata URLs alongside the harmonized attribute contract.
 *
 * The metadata URLs are SP-side and unauthenticated; an IdP can curl
 * them without a teable admin session. The attribute table shows the
 * one-way mapping (unified ⇐ SAML | OIDC) so operators can verify the
 * contract before they trust a new IdP.
 */
export const SsoFederationPanel = () => {
  const { t } = useTranslation('common');
  const { publicOrigin } = useEnv();
  // Public-origin may be unset during SSR — fall back to the browser origin.
  const origin =
    publicOrigin ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  const samlUrl = `${origin.replace(/\/$/, '')}/api/auth/sso/federation/saml-metadata.xml`;
  const oidcUrl = `${origin.replace(/\/$/, '')}/api/auth/sso/federation/oidc-discovery.json`;

  return (
    <div className="pb-6">
      <h2 className="mb-4 text-lg font-medium">
        {t('admin.ssoFederation.title', 'SSO Federation')}
      </h2>
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 shadow-sm">
        <p className="text-sm text-muted-foreground">
          {t(
            'admin.ssoFederation.description',
            'Expose SAML and OIDC metadata so external IdPs can wire Teable as a federated relying party. Both endpoints are public and cacheable.'
          )}
        </p>

        <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('admin.ssoFederation.samlLabel', 'SAML 2.0 SP metadata')}
            </div>
            <div className="truncate font-mono text-xs">{samlUrl}</div>
          </div>
          <CopyButton text={samlUrl} size="sm" label={t('admin.ssoFederation.copy', 'Copy')} />
        </div>

        <div className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t('admin.ssoFederation.oidcLabel', 'OIDC discovery')}
            </div>
            <div className="truncate font-mono text-xs">{oidcUrl}</div>
          </div>
          <CopyButton text={oidcUrl} size="sm" label={t('admin.ssoFederation.copy', 'Copy')} />
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('admin.ssoFederation.mappingTitle', 'Attribute harmonization')}
          </div>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full table-fixed text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">
                    {t('admin.ssoFederation.colUnified', 'Unified')}
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    {t('admin.ssoFederation.colSaml', 'SAML source')}
                  </th>
                  <th className="px-2 py-1.5 text-left font-medium">
                    {t('admin.ssoFederation.colOidc', 'OIDC source')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ATTRIBUTE_MAPPING.map((row) => (
                  <tr key={row.unified} className="border-t">
                    <td className="px-2 py-1.5 font-mono font-medium">{row.unified}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{row.saml}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{row.oidc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
