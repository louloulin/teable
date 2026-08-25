/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Quota consumption anomaly alert — Stage 78.
 *
 * Cooperates with Stage 65 (org-level quota orchestration) and Stage 45
 * (notification center) by computing anomaly scores on rolling quota
 * windows and dispatching alert payloads to the notification sink.
 */

export type QuotaMetric =
  | 'rows'
  | 'apiCalls'
  | 'storage'
  | 'aiCredits'
  | 'webhooks'
  | 'attachments';
export type AnomalySeverity = 'info' | 'warning' | 'critical';
export type NotificationChannel = 'email' | 'inbox' | 'webhook' | 'slack';

export interface IQuotaSample {
  orgId: string;
  metric: QuotaMetric;
  /** ISO timestamp at sample end. */
  endedAt: string;
  /** Total consumption in this window. */
  value: number;
  /** Soft cap used to derive score. */
  cap: number;
}

export interface IQuotaWindow {
  metric: QuotaMetric;
  /** Sliding window length (e.g. 24h). */
  durationMs: number;
  samples: IQuotaSample[];
}

export interface IAnomalyReport {
  id: string;
  orgId: string;
  metric: QuotaMetric;
  severity: AnomalySeverity;
  /** Burst factor vs the rolling median. */
  ratio: number;
  /** % of cap consumed. */
  capRatio: number;
  channels: NotificationChannel[];
  detail: string;
  detectedAt: string;
}

export const ANOMALY_RATIO_WARNING = 1.5;
export const ANOMALY_RATIO_CRITICAL = 3.0;
export const ANOMALY_CAP_RATIO_WARNING = 0.7;
export const ANOMALY_CAP_RATIO_CRITICAL = 0.9;
export const MAX_WINDOW_SAMPLES = 64;
export const MAX_CHANNELS_PER_REPORT = 4;
export const ANOMALY_METRICS: ReadonlyArray<QuotaMetric> = [
  'rows',
  'apiCalls',
  'storage',
  'aiCredits',
  'webhooks',
  'attachments',
];
export const ANOMALY_SEVERITIES: ReadonlyArray<AnomalySeverity> = ['info', 'warning', 'critical'];
export const ANOMALY_CHANNELS: ReadonlyArray<NotificationChannel> = [
  'email',
  'inbox',
  'webhook',
  'slack',
];
