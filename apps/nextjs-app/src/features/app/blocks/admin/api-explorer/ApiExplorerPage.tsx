import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';
import { useOrigin } from '@/features/app/hooks/useOrigin';

export interface IApiExplorerPageProps {
  /**
   * Optional override for the Scalar docs URL. Defaults to `<origin>/openapi/docs`,
   * which the NestJS backend serves from `OpenApiDocController#docs`.
   */
  docsPath?: string;
}

/**
 * Admin "API Explorer" page.
 *
 * The NestJS backend already ships a Scalar-powered OpenAPI viewer at
 * `GET /openapi/docs` (see `openapi-doc.controller.ts`). The route is
 * `@Public()` so the iframe works without forwarding any session cookies.
 *
 * We embed it via `<iframe>` rather than pulling in `@scalar/api-reference-react`
 * because adding a new npm dependency is out of scope. When the Next.js app
 * and the NestJS backend share an origin (the common case) the iframe points
 * to a same-origin URL; when they differ, the configured `PUBLIC_ORIGIN`
 * env is used so deployments on separate hosts still work.
 */
export const ApiExplorerPage = (props: IApiExplorerPageProps) => {
  const { t } = useTranslation('common');
  const origin = useOrigin();
  const docsPath = props.docsPath ?? '/openapi/docs';
  const docsUrl = useMemo(() => {
    const trimmedPath = docsPath.startsWith('/') ? docsPath : `/${docsPath}`;
    if (!origin) return trimmedPath;
    return `${origin.replace(/\/$/, '')}${trimmedPath}`;
  }, [origin, docsPath]);

  return (
    <div className="flex size-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b bg-card px-8 py-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('settings.apiExplorer.title')}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {t('settings.apiExplorer.description')}
          </div>
        </div>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {t('settings.apiExplorer.openInNewTab')}
        </a>
      </div>
      <div className="relative flex-1 bg-background">
        <iframe
          src={docsUrl}
          title={t('settings.apiExplorer.title')}
          className="absolute inset-0 size-full border-0"
          // The Scalar page itself loads scripts from `cdn.jsdelivr.net`; allow it.
          // The backend sets a strict CSP, but the iframe document is rendered
          // there so we don't need to relax our parent CSP further.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      </div>
    </div>
  );
};
