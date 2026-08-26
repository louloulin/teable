import { useQueries, useQuery } from '@tanstack/react-query';
import { ChevronDown } from '@teable/icons';
import { getSpaceList } from '@teable/openapi';
import type { IMirrorLag } from '@teable/openapi';
import { ReactQueryKeys } from '@teable/sdk/config';
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@teable/ui-lib/shadcn';
import { useRouter } from 'next/router';
import { useMemo, type FC } from 'react';

import { useBaseList } from '../space/useBaseList';
import { getMirrorLag, listMirrorConfigs, mirrorQueryKeys } from './mirrorApi';
import { MirrorStatusBadge } from './MirrorStatusBadge';

/**
 * Top-bar workspace switcher.
 *
 * Lists the spaces the signed-in user can see and navigates to the picked one.
 * Mirror health is folded in per space: mirror configs are keyed by baseId, so
 * each configured base is attributed to its space via the base list, and the
 * space shows its worst standby lag.
 */

/** How often to re-poll mirror lag while the dropdown is mounted. */
const LAG_REFETCH_MS = 30_000;

/** Ordering used to pick the single lag a space displays. */
const worseFirst = (a: IMirrorLag, b: IMirrorLag) =>
  b.seqLag - a.seqLag || b.secondsLag - a.secondsLag;

interface IWorkspaceSwitcherDropdownProps {
  className?: string;
}

export const WorkspaceSwitcherDropdown: FC<IWorkspaceSwitcherDropdownProps> = ({ className }) => {
  const router = useRouter();
  const activeSpaceId = router.query.spaceId as string | undefined;

  const { data: spaceList } = useQuery({
    queryKey: ReactQueryKeys.spaceList(),
    queryFn: () => getSpaceList().then((res) => res.data),
  });

  const baseList = useBaseList();

  // Mirror config is space-admin-only; a 402/403 here is expected on installs
  // without the capability, so never retry and never surface an error state —
  // the switcher must keep working without mirror data.
  const { data: mirrorConfigs } = useQuery({
    queryKey: mirrorQueryKeys.configs(),
    queryFn: listMirrorConfigs,
    retry: false,
    staleTime: LAG_REFETCH_MS,
  });

  const mirroredBaseIds = useMemo(
    () => (mirrorConfigs ?? []).map((config) => config.baseId),
    [mirrorConfigs]
  );

  const lagQueries = useQueries({
    queries: mirroredBaseIds.map((baseId) => ({
      queryKey: mirrorQueryKeys.lag(baseId),
      queryFn: () => getMirrorLag(baseId),
      retry: false,
      refetchInterval: LAG_REFETCH_MS,
    })),
  });

  /** spaceId -> worst lag across that space's mirrored bases. */
  const lagBySpaceId = useMemo(() => {
    if (!baseList) return {} as Record<string, IMirrorLag>;
    const spaceIdByBaseId = new Map(baseList.map((base) => [base.id, base.spaceId]));
    const collected: Record<string, IMirrorLag[]> = {};
    mirroredBaseIds.forEach((baseId, index) => {
      const lag = lagQueries[index]?.data;
      const spaceId = spaceIdByBaseId.get(baseId);
      if (!lag || !spaceId) return;
      (collected[spaceId] ??= []).push(lag);
    });
    return Object.fromEntries(
      Object.entries(collected).map(([spaceId, lags]) => [spaceId, [...lags].sort(worseFirst)[0]])
    ) as Record<string, IMirrorLag>;
  }, [baseList, mirroredBaseIds, lagQueries]);

  const activeSpace = useMemo(
    () => spaceList?.find((space) => space.id === activeSpaceId),
    [spaceList, activeSpaceId]
  );

  const handleSelect = (spaceId: string) => {
    if (spaceId === activeSpaceId) return;
    router.push({ pathname: '/space/[spaceId]', query: { spaceId } });
  };

  if (!spaceList?.length) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          className={cn('max-w-[220px] gap-1.5 font-normal', className)}
        >
          <span className="truncate">{activeSpace?.name ?? 'All spaces'}</span>
          {activeSpaceId && <MirrorStatusBadge lag={lagBySpaceId[activeSpaceId]} />}
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[260px]">
        <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {spaceList.map((space) => (
          <DropdownMenuItem
            key={space.id}
            onSelect={() => handleSelect(space.id)}
            className="flex items-center justify-between gap-2"
          >
            <span className={cn('truncate', space.id === activeSpaceId && 'font-semibold')}>
              {space.name}
            </span>
            <MirrorStatusBadge lag={lagBySpaceId[space.id]} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push({ pathname: '/space' })}>
          All spaces
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
