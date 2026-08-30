import { useEnv } from './useEnv';

export const useIsSelfHosted = () => {
  const { edition } = useEnv();
  const normalizedEdition = edition?.toUpperCase();

  return !normalizedEdition || normalizedEdition === 'SELF_HOSTED' || normalizedEdition === 'OSS';
};
