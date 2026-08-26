import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IGoogleSheetsConnectRo } from '@teable/openapi';
import { connectGoogleSheets, getGoogleSheetsAuthorizeUrl } from '@teable/openapi';
import { Button } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { useTranslation } from 'next-i18next';
import { useEffect, useRef } from 'react';

const POPUP_FEATURES = 'width=520,height=640,left=200,top=120';
const OAUTH_MESSAGE_TYPE = 'teable:google-sheets-oauth';

interface IOAuthMessage {
  type: string;
  code?: string;
  error?: string;
}

/**
 * OAuth connect control — T-15 Wave 10.
 *
 * Opens a Google consent popup, listens for the postMessage
 * that the callback page should dispatch with the `code`, then
 * calls POST /admin/google-sheets/connect with `{ code, spaceId }`.
 *
 * The backend stores tokens per `googleSheets.<spaceId>` key in
 * the setting table (encrypted at rest). We invalidate the
 * status query on success so the panel can flip to "connected".
 */
export const ConnectButton = ({ spaceId }: { spaceId: string }) => {
  const { t } = useTranslation('common');
  const popupRef = useRef<Window | null>(null);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (ro: IGoogleSheetsConnectRo) => connectGoogleSheets(ro).then((r) => r.data),
  });

  const queryClient = useQueryClient();
  const onMessage = (event: MessageEvent<IOAuthMessage>) => {
    if (!event.data || event.data.type !== OAUTH_MESSAGE_TYPE) return;
    if (event.data.error) {
      toast.error(event.data.error);
      popupRef.current?.close();
      return;
    }
    const code = event.data.code;
    if (!code) return;
    popupRef.current?.close();
    mutateAsync({ code, spaceId })
      .then(() => {
        toast.success(t('admin.googleSheets.connected'));
        void queryClient.invalidateQueries({ queryKey: ['admin', 'google-sheets', 'status'] });
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : t('admin.googleSheets.error.invalidCode'));
      });
  };

  useEffect(() => {
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  const onClick = async () => {
    try {
      const { data } = await getGoogleSheetsAuthorizeUrl();
      if (!data.configured) {
        toast.error(t('admin.googleSheets.error.invalidCode'));
        return;
      }
      popupRef.current = window.open(data.url, 'gs-oauth', POPUP_FEATURES);
      if (!popupRef.current) {
        toast.error(t('admin.googleSheets.error.invalidCode'));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('admin.googleSheets.error.invalidCode'));
    }
  };

  return (
    <Button size="sm" disabled={isPending || !spaceId} onClick={() => void onClick()}>
      {isPending ? t('admin.googleSheets.connecting') : t('admin.googleSheets.connect')}
    </Button>
  );
};
