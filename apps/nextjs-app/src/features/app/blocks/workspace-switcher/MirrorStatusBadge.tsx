import type { IMirrorLag, MirrorStatus } from '@teable/openapi';
import { Badge, cn } from '@teable/ui-lib/shadcn';
import type { FC } from 'react';

/**
 * Compact mirror health indicator. Renders a single `IMirrorLag` — the worst
 * standby for a base, which is what `GET /configs/:baseId/lag` returns.
 */

/** Badge variant per status. `paused` and `broken` are the ones to notice. */
const variantByStatus: Record<MirrorStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  idle: 'secondary',
  streaming: 'default',
  lagging: 'outline',
  paused: 'outline',
  broken: 'destructive',
};

/** Dot colour per status, so the badge reads at a glance without the label. */
const dotByStatus: Record<MirrorStatus, string> = {
  idle: 'bg-muted-foreground',
  streaming: 'bg-green-500',
  lagging: 'bg-amber-500',
  paused: 'bg-amber-600',
  broken: 'bg-destructive',
};

/**
 * `secondsLag` is `Infinity` when no batch has ever shipped. JSON has no
 * Infinity, so it arrives as `null` — treat both as "never".
 */
const formatLag = (secondsLag: number | null): string => {
  if (secondsLag === null || !Number.isFinite(secondsLag)) {
    return 'never';
  }
  if (secondsLag < 1) return '<1s';
  if (secondsLag < 60) return `${Math.round(secondsLag)}s`;
  if (secondsLag < 3600) return `${Math.round(secondsLag / 60)}m`;
  return `${Math.round(secondsLag / 3600)}h`;
};

interface IMirrorStatusBadgeProps {
  lag?: IMirrorLag;
  /** Show the region name alongside the status. Off in tight rows. */
  showRegion?: boolean;
  className?: string;
}

export const MirrorStatusBadge: FC<IMirrorStatusBadgeProps> = ({
  lag,
  showRegion = false,
  className,
}) => {
  if (!lag) {
    return null;
  }
  const lagLabel = formatLag(lag.secondsLag);
  return (
    <Badge
      variant={variantByStatus[lag.status]}
      className={cn('gap-1.5 font-normal', className)}
      title={`region ${lag.region} · ${lag.status} · ${lag.seqLag} ops behind · last ack ${lagLabel} ago`}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', dotByStatus[lag.status])} />
      <span className="truncate">
        {showRegion ? `${lag.region} · ` : ''}
        {lag.status}
        {lag.seqLag > 0 ? ` · ${lag.seqLag}` : ''}
      </span>
    </Badge>
  );
};
