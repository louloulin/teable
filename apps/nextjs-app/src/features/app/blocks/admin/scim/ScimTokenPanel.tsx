import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { IScimConfigVo } from '@teable/openapi';
import { getScimConfig, rotateScimToken } from '@teable/openapi';
import type { ButtonProps } from '@teable/ui-lib/shadcn';
import { Button, Skeleton } from '@teable/ui-lib/shadcn';
import { toast } from '@teable/ui-lib/shadcn/ui/sonner';
import { RotateCw } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { useState } from 'react';
import { CopyButton } from '@/features/app/components/CopyButton';

/**
 * SCIM bearer-token control panel. The raw token is intentionally only
 * exposed once, right after a rotation — refresh-after-rotation will keep
 * the freshly-issued token visible until the admin navigates away. After
 * that we fall back to `hasToken=true` indicator only.
 */
export const ScimTokenPanel = ({ config }: { config: IScimConfigVo | undefined }) => {
  const { t } = useTranslation('common');
  const queryClient = useQueryClient();
  const [rotatedToken, setRotatedToken] = useState<string | null>(null);

  const { mutateAsync, isPending } = useMutation({
    mutationFn: () => rotateScimToken().then((r) => r.data),
    onSuccess: (data) => {
      setRotatedToken(data.token);
      queryClient.invalidateQueries({ queryKey: ['admin', 'scim', 'config'] });
      toast.success(t('admin.scim.token.rotated'));
    },
  });

  if (!config) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-1/2" />
      </div>
    );
  }

  const buttonSize = 'sm' as ButtonProps['size'];

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">{t('admin.scim.token.title')}</div>
        <div className="text-xs text-muted-foreground">{t('admin.scim.token.description')}</div>
      </div>

      <div className="flex items-center gap-2">
        <code
          data-testid="scim-token-display"
          className="flex-1 truncate rounded bg-muted px-3 py-2 font-mono text-xs"
        >
          {rotatedToken ?? (config.hasToken ? '••••••••••••••••' : t('admin.scim.token.absent'))}
        </code>
        {rotatedToken && (
          <CopyButton size={buttonSize} text={rotatedToken} label={t('admin.scim.token.copy')} />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {config.lastRotatedTime
            ? t('admin.scim.token.lastRotated', {
                time: new Date(config.lastRotatedTime).toLocaleString(),
              })
            : t('admin.scim.token.neverRotated')}
        </div>
        <Button
          size={buttonSize}
          variant="outline"
          disabled={isPending}
          onClick={() => {
            setRotatedToken(null);
            void mutateAsync();
          }}
        >
          <RotateCw className="mr-1 size-3.5" />
          {isPending ? t('admin.scim.token.rotating') : t('admin.scim.token.rotate')}
        </Button>
      </div>
    </div>
  );
};

export const useScimConfig = () => {
  return getScimConfig;
};
