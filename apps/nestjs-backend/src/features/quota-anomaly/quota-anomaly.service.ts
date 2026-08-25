/**
 * Quota consumption anomaly detection — pure helpers (Stage 78).
 */

import type {
  AnomalySeverity,
  IAnomalyReport,
  IQuotaSample,
  IQuotaWindow,
  NotificationChannel,
  QuotaMetric,
} from './quota-anomaly.types';
import {
  ANOMALY_CAP_RATIO_CRITICAL,
  ANOMALY_CAP_RATIO_WARNING,
  ANOMALY_CHANNELS,
  ANOMALY_METRICS,
  ANOMALY_RATIO_CRITICAL,
  ANOMALY_RATIO_WARNING,
  MAX_CHANNELS_PER_REPORT,
  MAX_WINDOW_SAMPLES,
} from './quota-anomaly.types';

/** Validate a quota metric. */
export function isQuotaMetric(s: string): s is QuotaMetric {
  return (ANOMALY_METRICS as ReadonlyArray<string>).includes(s);
}

/** Validate a notification channel. */
export function isNotificationChannel(s: string): s is NotificationChannel {
  return (ANOMALY_CHANNELS as ReadonlyArray<string>).includes(s);
}

/** Validate a sample shape. */
export function validateSample(s: IQuotaSample): string | null {
  if (!s.orgId) return 'orgId required';
  if (!isQuotaMetric(s.metric)) return `unknown metric: ${s.metric}`;
  if (!s.endedAt) return 'endedAt required';
  if (!Number.isFinite(s.value) || s.value < 0) return 'value must be >= 0';
  if (!Number.isFinite(s.cap) || s.cap <= 0) return 'cap must be > 0';
  return null;
}

/** Build a rolling window. */
export function buildWindow(input: { metric: QuotaMetric; durationMs: number }): IQuotaWindow {
  return { metric: input.metric, durationMs: input.durationMs, samples: [] };
}

/** Append a sample and trim to MAX_WINDOW_SAMPLES. */
export function appendSample(input: { window: IQuotaWindow; sample: IQuotaSample }): IQuotaWindow {
  const samples = [...input.window.samples, input.sample];
  while (samples.length > MAX_WINDOW_SAMPLES) samples.shift();
  return { ...input.window, samples };
}

/** Compute median of sample values; 0 when empty. */
export function medianValue(samples: IQuotaSample[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].map((s) => s.value).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Compute cap ratio for the latest sample. */
export function capRatio(s: IQuotaSample): number {
  return s.value / s.cap;
}

/** Compute burst ratio vs the median. */
export function burstRatio(input: { latest: IQuotaSample; median: number }): number {
  if (input.median <= 0) return input.latest.value > 0 ? Infinity : 0;
  return input.latest.value / input.median;
}

/** Decide severity from ratio and cap ratio. */
export function severityFromRatios(input: { ratio: number; cap: number }): AnomalySeverity {
  const r = Number.isFinite(input.ratio) ? input.ratio : Number.MAX_SAFE_INTEGER;
  const c = input.cap;
  if (r >= ANOMALY_RATIO_CRITICAL || c >= ANOMALY_CAP_RATIO_CRITICAL) {
    return 'critical';
  }
  if (r >= ANOMALY_RATIO_WARNING || c >= ANOMALY_CAP_RATIO_WARNING) {
    return 'warning';
  }
  return 'info';
}

/** Decide which channels should receive a report. */
export function channelsForSeverity(s: AnomalySeverity): NotificationChannel[] {
  if (s === 'critical') return ['email', 'inbox', 'webhook'];
  if (s === 'warning') return ['inbox', 'webhook'];
  return ['inbox'];
}

/** Cap channels per report. */
export function capChannels(channels: NotificationChannel[]): NotificationChannel[] {
  if (channels.length <= MAX_CHANNELS_PER_REPORT) return channels;
  return channels.slice(0, MAX_CHANNELS_PER_REPORT);
}

/** Build a full anomaly report. */
export function buildReport(input: {
  id: string;
  sample: IQuotaSample;
  median: number;
  now: string;
}): IAnomalyReport {
  const ratio = burstRatio({ latest: input.sample, median: input.median });
  const cap = capRatio(input.sample);
  const severity = severityFromRatios({ ratio, cap });
  const channels = capChannels(channelsForSeverity(severity));
  const detail =
    `metric=${input.sample.metric} value=${input.sample.value} ` +
    `cap=${input.sample.cap} ratio=${Number.isFinite(ratio) ? ratio.toFixed(2) : 'inf'} ` +
    `capRatio=${cap.toFixed(2)} severity=${severity}`;
  return {
    id: input.id,
    orgId: input.sample.orgId,
    metric: input.sample.metric,
    severity,
    ratio: Number.isFinite(ratio) ? Number(ratio.toFixed(2)) : Number.MAX_SAFE_INTEGER,
    capRatio: Number(cap.toFixed(2)),
    channels,
    detail,
    detectedAt: input.now,
  };
}

/** Evaluate a window and yield reports for every anomalous sample. */
export function evaluateWindow(input: {
  window: IQuotaWindow;
  idGen: () => string;
  now: string;
}): IAnomalyReport[] {
  const reports: IAnomalyReport[] = [];
  const seen: IQuotaSample[] = [];
  for (const sample of input.window.samples) {
    const med = medianValue(seen);
    const cap = capRatio(sample);
    // skip cold-start: no prior history yet — first observation isn't a burst
    if (seen.length === 0) {
      seen.push(sample);
      continue;
    }
    const ratio = burstRatio({ latest: sample, median: med });
    const severity = severityFromRatios({ ratio, cap });
    if (severity === 'info') {
      seen.push(sample);
      continue;
    }
    const report = buildReport({ id: input.idGen(), sample, median: med, now: input.now });
    reports.push(report);
    seen.push(sample);
  }
  return reports;
}

/** Trim a reports list to the most recent N. */
export function trimReports(input: { reports: IAnomalyReport[]; cap: number }): IAnomalyReport[] {
  if (input.reports.length <= input.cap) return input.reports;
  return input.reports.slice(input.reports.length - input.cap);
}
