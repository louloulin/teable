import type { ICreateSpaceRo, IDataDbPreflightVo } from '@teable/openapi';

type DataDbMode = 'default' | 'byodb';

export const isByodbSpaceCreateEnabled = (edition?: string) => {
  const normalizedEdition = edition?.toUpperCase();
  return !normalizedEdition || normalizedEdition === 'EE' || normalizedEdition === 'SELF_HOSTED';
};

export const getCreateSpaceDataDbPayload = (
  mode: DataDbMode,
  url: string
): Partial<ICreateSpaceRo> => {
  if (mode !== 'byodb') {
    return {};
  }

  return {
    dataDb: {
      mode: 'byodb',
      url: url.trim(),
      targetMode: 'initialize-empty',
    },
  };
};

export const canCreateSpaceWithDataDb = (
  mode: DataDbMode,
  url: string,
  preflightResult?: Pick<IDataDbPreflightVo, 'ok'>,
  testedUrl?: string
) => {
  if (mode === 'default') {
    return true;
  }

  const trimmedUrl = url.trim();
  return Boolean(trimmedUrl && preflightResult?.ok && testedUrl === trimmedUrl);
};
