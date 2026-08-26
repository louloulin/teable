/**
 * Notification — read-only types for the thin-DI auth surface.
 *
 * Mirrors a small projection of the Prisma `Notification` row. The full
 * notification lifecycle (create, send-by-socket, email) stays in
 * `notification.service.ts`; this file only describes what callers
 * receive from the auth-wrapper reads.
 */

export type NotificationSeverityKind = 'info' | 'warning' | 'critical';

export type NotificationTypeKind =
  | 'system'
  | 'exportBase'
  | 'adminNotice'
  | 'comment'
  | 'collaboratorCellTag'
  | 'collaboratorMultiRowTag'
  | 'collaboratorInvite'
  | string;

export interface INotificationRecentItem {
  id: string;
  fromUserId: string;
  toUserId: string;
  type: NotificationTypeKind;
  message: string;
  messageI18n: string | null;
  severity: NotificationSeverityKind;
  urlPath: string | null;
  isRead: boolean;
  createdTime: string;
}

export interface INotificationRecentQuery {
  userId: string;
  /** Max rows to return. */
  limit?: number;
  /** When set, only returns unread notifications. */
  onlyUnread?: boolean;
}

export interface INotificationRecentResult {
  items: INotificationRecentItem[];
  /** True when `limit` rows were returned (more may exist). */
  truncated: boolean;
}
