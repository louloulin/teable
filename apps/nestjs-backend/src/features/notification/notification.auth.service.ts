/**
 * Notification — NestJS thin-DI auth service.
 *
 * Read-only wrapper that exposes a tiny surface for callers that
 * only need recent notifications for a user. Delegates formatting
 * to `notification.helpers.ts` and only touches `findMany` on
 * Prisma — write paths still live in `notification.service.ts`.
 */

import { Injectable } from '@nestjs/common';
import type { Prisma } from '@teable/db-main-prisma';
import { PrismaService } from '@teable/db-main-prisma';

import { formatNotificationType, sortByRecency } from './notification.helpers';
import type {
  INotificationRecentItem,
  INotificationRecentQuery,
  INotificationRecentResult,
} from './notification.types';

const notificationRecentSelect = {
  id: true,
  fromUserId: true,
  toUserId: true,
  type: true,
  message: true,
  messageI18n: true,
  severity: true,
  urlPath: true,
  isRead: true,
  createdTime: true,
} satisfies Prisma.NotificationSelect;

type NotificationRecentRow = Prisma.NotificationGetPayload<{
  select: typeof notificationRecentSelect;
}>;

@Injectable()
export class NotificationAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List the most-recent notifications for a user. Used by:
   *   - popover dropdowns that need a quick slice without cursors,
   *   - other thin-DI wrappers that compose a notification summary.
   */
  async listRecent(query: INotificationRecentQuery): Promise<INotificationRecentResult> {
    const limit = clampLimit(query.limit);
    const rows = await this.prisma.notification.findMany({
      select: notificationRecentSelect,
      where: {
        toUserId: query.userId,
        ...(query.onlyUnread ? { isRead: false } : {}),
      },
      orderBy: { createdTime: 'desc' },
      take: limit + 1,
    });
    const truncated = rows.length > limit;
    const page = truncated ? rows.slice(0, limit) : rows;
    const items = sortByRecency(page).map(toRecentItem);
    return { items, truncated };
  }

  /** Convenience: human-readable label for a row's `type`. */
  label(type: string): string {
    return formatNotificationType(type);
  }
}

function toRecentItem(row: NotificationRecentRow): INotificationRecentItem {
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    type: row.type,
    message: row.message,
    messageI18n: row.messageI18n,
    severity: row.severity as INotificationRecentItem['severity'],
    urlPath: row.urlPath,
    isRead: row.isRead,
    createdTime: row.createdTime.toISOString(),
  };
}

function clampLimit(input: number | undefined): number {
  const n = input ?? 10;
  if (!Number.isFinite(n) || n <= 0) return 10;
  return Math.min(Math.floor(n), 100);
}
