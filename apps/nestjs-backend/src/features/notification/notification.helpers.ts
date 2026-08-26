/**
 * Notification — pure helper functions.
 *
 * No DI, no I/O. Used by both `notification.service.ts` (legacy) and
 * `notification.auth.service.ts` (thin-DI wrapper) to format rows and
 * sort payloads consistently.
 */

import type { NotificationTypeKind } from './notification.types';

/** Map a raw DB `type` string into a UI-friendly label. */
export function formatNotificationType(type: string): string {
  const trimmed = type.replace(/[._-]+/g, ' ').trim();
  if (!trimmed) return 'Notification';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/**
 * Stable recency sort for items carrying a `createdTime` field.
 * Returns a new array — does not mutate the input.
 */
export function sortByRecency<T extends { createdTime: Date | string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.createdTime instanceof Date ? a.createdTime.getTime() : Date.parse(a.createdTime);
    const bTime = b.createdTime instanceof Date ? b.createdTime.getTime() : Date.parse(b.createdTime);
    return bTime - aTime;
  });
}

/** Re-export of `formatNotificationType` keyed by the type union. */
export const NOTIFICATION_TYPE_LABELS: Record<NotificationTypeKind, string> = {
  system: 'System',
  exportBase: 'Export base',
  adminNotice: 'Admin notice',
  comment: 'Comment',
  collaboratorCellTag: 'Collaborator tag',
  collaboratorMultiRowTag: 'Collaborator tags',
  collaboratorInvite: 'Invite',
};
