import { FileText, Loader2 } from '@teable/icons';
import { notionConnect } from '@teable/openapi';
import { Button, cn } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useTranslation } from 'next-i18next';
import React from 'react';

const POPUP_FEATURES = 'width=600,height=720,left=200,top=120,popup=yes';
const POPUP_TIMEOUT_MS = 5 * 60 * 1000;

interface IConnectButtonProps {
  spaceId: string;
  /** Called after a successful connect so the parent can refresh state. */
  onConnected?: (workspaceName: string) => void;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
}

/**
 * Notion OAuth connect entry.
 *
 * Opens Notion's authorize URL in a popup. The popup redirects back to the
 * Nest controller (`POST /api/admin/notion/connect` with the authorization
 * code) via a tiny client-side bridge that posts the code to the opener.
 * Once the code is exchanged we surface a toast and notify the parent.
 */
export const ConnectButton = (props: IConnectButtonProps) => {
  const { spaceId, onConnected, className, variant = 'default' } = props;
  const { t } = useTranslation(['common', 'space']);
  const [busy, setBusy] = React.useState(false);

  const onConnect = async () => {
    if (!spaceId) {
      toast.error(t('space:adminImport.noSpace'));
      return;
    }
    setBusy(true);
    try {
      // We don't have a pre-built authorize URL helper from the openapi
      // package (Notion's authorize URL is built from env vars on the
      // backend) — instead, navigate the popup to the backend redirect
      // endpoint which 302s to Notion's `/v1/oauth/authorize`.
      const authorizeEndpoint = `/api/admin/notion/authorize?spaceId=${encodeURIComponent(spaceId)}`;
      const popup = window.open(authorizeEndpoint, 'notion-oauth', POPUP_FEATURES);
      if (!popup) {
        toast.error(t('common:actions.popupBlocked'));
        return;
      }
      const code = await waitForOAuthCode(popup);
      const { data } = await notionConnect({ code, spaceId });
      onConnected?.(data.workspaceName);
      toast.success(t('common:admin.notion.connected'));
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : t('common:admin.notion.error.invalidCode');
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      onClick={onConnect}
      disabled={busy}
      variant={variant}
      className={cn('gap-2', className)}
      type="button"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <FileText className="size-4" />
      )}
      {busy ? t('common:admin.notion.connecting') : t('common:admin.notion.connect')}
    </Button>
  );
};

/**
 * Resolve the authorization code from the OAuth popup. The popup either:
 *   1. Posts `{ type: 'notion-oauth-code', code }` to `window.opener`, or
 *   2. Posts `{ type: 'notion-oauth-error', message }` on failure.
 *
 * Polls the popup's `closed` flag as a safety net for the case where the
 * user dismisses the popup without delivering a message (e.g. closes it
 * before the redirect completes).
 */
const waitForOAuthCode = (popup: Window): Promise<string> => {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('OAuth timed out'));
    }, POPUP_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; code?: string; message?: string } | null;
      if (!data || typeof data.type !== 'string') {
        return;
      }
      if (data.type === 'notion-oauth-code' && typeof data.code === 'string') {
        cleanup();
        resolve(data.code);
      } else if (data.type === 'notion-oauth-error') {
        cleanup();
        reject(new Error(data.message ?? 'Notion OAuth failed'));
      }
    };

    const pollClosed = window.setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error('OAuth popup was closed before completion'));
      }
    }, 500);

    const cleanup = () => {
      window.clearTimeout(timer);
      window.clearInterval(pollClosed);
      window.removeEventListener('message', onMessage);
    };

    window.addEventListener('message', onMessage);
  });
};
