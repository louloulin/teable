import { useIsReadOnlyPreview } from '@teable/sdk/hooks';
import { useEnv } from './useEnv';
import { useIsSelfHosted } from './useIsSelfHosted';

export const useIsCommunity = () => {
  const { edition } = useEnv();
  const isReadOnlyPreview = useIsReadOnlyPreview();
  const isSelfHosted = useIsSelfHosted();

  // In template/share preview mode, allow all features to be displayed
  // (similar to how template preview works)
  if (isReadOnlyPreview) {
    return false;
  }

  return !isSelfHosted && edition?.toUpperCase() !== 'EE' && edition?.toUpperCase() !== 'CLOUD';
};
