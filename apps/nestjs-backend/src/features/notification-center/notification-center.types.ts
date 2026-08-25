/**
 * Notification center — Stage 45.
 *
 * The `Notification` row describes a single notification addressed to a user.
 * `NotificationChannel` indicates how the user wants to receive it.
 * `NotificationDelivery` records each channel we tried.
 */

export type NotificationKind =
  | 'mention'
  | 'comment-reply'
  | 'automation-run'
  | 'approval-request'
  | 'approval-decision'
  | 'system';

export type NotificationChannel = 'in-app' | 'email' | 'desktop' | 'webhook';

export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface INotification {
  id: string;
  baseId: string;
  recipientUserId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /// Optional link back into the app (record, view, comment).
  link?: string;
  /// Source object id (record id, comment id, automation run id...).
  sourceId?: string;
  readAt: Date | null;
  createdTime: Date;
}

export interface INotificationDelivery {
  id: string;
  notificationId: string;
  channel: NotificationChannel;
  status: DeliveryStatus;
  attempts: number;
  lastError?: string;
  sentAt?: Date;
}

export interface INotificationPreference {
  userId: string;
  /// Map of NotificationKind → enabled channels.
  channels: Record<NotificationKind, NotificationChannel[]>;
  /// Quiet hours: 0–23 hour-of-day when no email/desktop pings should be sent.
  quietHoursStart?: number;
  quietHoursEnd?: number;
}

export interface ICreateNotificationInput {
  baseId: string;
  recipientUserId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string;
  sourceId?: string;
}

export interface INotificationDispatchResult {
  notification: INotification;
  deliveries: INotificationDelivery[];
}

export const DEFAULT_TITLE_MAX_LENGTH = 200;
export const DEFAULT_BODY_MAX_LENGTH = 2000;
