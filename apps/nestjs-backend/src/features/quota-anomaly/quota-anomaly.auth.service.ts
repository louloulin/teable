/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Quota anomaly — NestJS auth service (Stage 78).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  appendSample,
  buildReport,
  buildWindow,
  capChannels,
  channelsForSeverity,
  evaluateWindow,
  trimReports,
  validateSample,
} from './quota-anomaly.service';
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
  ANOMALY_SEVERITIES,
  MAX_CHANNELS_PER_REPORT,
  MAX_WINDOW_SAMPLES,
} from './quota-anomaly.types';
@Injectable()
export class QuotaAnomalyAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a sample and persist it; returns the report if anomalous. */
  async recordSample(input: {
    sample: IQuotaSample;
    durationMs: number;
    reportId: string;
    now: string;
  }): Promise<IAnomalyReport | null> {
    const err = validateSample(input.sample);
    if (err) throw new Error(`invalid sample: ${err}`);
    await this.prisma.quotaSample.create({
      data: {
        id: input.sample.orgId + ':' + input.sample.metric + ':' + input.sample.endedAt,
        orgId: input.sample.orgId,
        metric: input.sample.metric,
        endedAt: new Date(input.sample.endedAt),
        value: input.sample.value,
        cap: input.sample.cap,
      },
    });
    const recent = await this.loadRecentRows({
      orgId: input.sample.orgId,
      metric: input.sample.metric,
    });
    const win = buildWindow({ metric: input.sample.metric, durationMs: input.durationMs });
    let populated = win;
    for (const r of recent) populated = appendSample({ window: populated, sample: r });
    const reports = evaluateWindow({
      window: populated,
      idGen: () => input.reportId,
      now: input.now,
    });
    if (reports.length === 0) return null;
    const last = reports[reports.length - 1]!;
    await this.persistReport(last);
    return last;
  }

  /** Decide which channels to notify for a given severity. */
  chooseChannels(severity: AnomalySeverity): NotificationChannel[] {
    return capChannels(channelsForSeverity(severity));
  }

  /** Convert a sample row to a DTO. */
  rowToSample(r: Record<string, unknown>): IQuotaSample {
    return {
      orgId: String(r['orgId']),
      metric: r['metric'] as QuotaMetric,
      endedAt: new Date(String(r['endedAt'])).toISOString(),
      value: Number(r['value']),
      cap: Number(r['cap']),
    };
  }

  /** Load recent rows from the persistence layer. */
  private async loadRecentRows(input: {
    orgId: string;
    metric: QuotaMetric;
  }): Promise<IQuotaSample[]> {
    const rows = await this.prisma.quotaSample.findMany({
      where: { orgId: input.orgId, metric: input.metric },
      orderBy: { endedAt: 'asc' },
      take: 64,
    });
    return rows.map((r) => this.rowToSample(r));
  }

  /** Persist a report. */
  private async persistReport(report: IAnomalyReport): Promise<void> {
    await this.prisma.quotaAnomalyReport.create({
      data: {
        id: report.id,
        orgId: report.orgId,
        metric: report.metric,
        severity: report.severity,
        ratio: report.ratio === Number.MAX_SAFE_INTEGER ? 1e9 : report.ratio,
        capRatio: report.capRatio,
        channelsJson: JSON.stringify(report.channels),
        detail: report.detail,
        detectedAt: new Date(report.detectedAt),
      },
    });
  }

  /** Trim a batch of reports to the cap. Pure pass-through. */
  trimReports(input: { reports: IAnomalyReport[]; cap: number }): IAnomalyReport[] {
    return trimReports(input);
  }

  /** Build an in-memory report (helper for tests / direct calls). */
  buildReportDirect(input: {
    id: string;
    sample: IQuotaSample;
    median: number;
    now: string;
  }): IAnomalyReport {
    return buildReport(input);
  }

  /** Materialize a window from raw rows. */
  materializeWindow(input: {
    metric: QuotaMetric;
    durationMs: number;
    rows: IQuotaSample[];
  }): IQuotaWindow {
    let win = buildWindow({ metric: input.metric, durationMs: input.durationMs });
    for (const s of input.rows) win = appendSample({ window: win, sample: s });
    return win;
  }

  /** List recent persisted reports (admin read-only). */
  async listReports(input: {
    limit?: number;
    severity?: AnomalySeverity;
    metric?: QuotaMetric;
    orgId?: string;
  }): Promise<IAnomalyReport[]> {
    const where: Record<string, unknown> = {};
    if (input.severity) where['severity'] = input.severity;
    if (input.metric) where['metric'] = input.metric;
    if (input.orgId) where['orgId'] = input.orgId;
    const rows = await this.prisma.quotaAnomalyReport.findMany({
      where,
      orderBy: { detectedAt: 'desc' },
      take: input.limit ?? 100,
    });
    return rows.map((r) => ({
      id: String(r['id']),
      orgId: String(r['orgId']),
      metric: r['metric'] as QuotaMetric,
      severity: r['severity'] as AnomalySeverity,
      ratio: Number(r['ratio']),
      capRatio: Number(r['capRatio']),
      channels: safeJsonArray(r['channelsJson']),
      detail: String(r['detail'] ?? ''),
      detectedAt: new Date(String(r['detectedAt'])).toISOString(),
    }));
  }

  /** Count persisted reports (admin read-only). */
  async countReports(input: {
    severity?: AnomalySeverity;
    metric?: QuotaMetric;
    orgId?: string;
  }): Promise<number> {
    const where: Record<string, unknown> = {};
    if (input.severity) where['severity'] = input.severity;
    if (input.metric) where['metric'] = input.metric;
    if (input.orgId) where['orgId'] = input.orgId;
    return this.prisma.quotaAnomalyReport.count({ where });
  }

  /** Return the current detection thresholds (admin read-only). */
  getThresholds(): Record<string, unknown> {
    return {
      ratioWarning: ANOMALY_RATIO_WARNING,
      ratioCritical: ANOMALY_RATIO_CRITICAL,
      capRatioWarning: ANOMALY_CAP_RATIO_WARNING,
      capRatioCritical: ANOMALY_CAP_RATIO_CRITICAL,
      metrics: ANOMALY_METRICS,
      severities: ANOMALY_SEVERITIES,
      channels: ANOMALY_CHANNELS,
      maxWindowSamples: MAX_WINDOW_SAMPLES,
      maxChannelsPerReport: MAX_CHANNELS_PER_REPORT,
    };
  }
}

function safeJsonArray(raw: unknown): NotificationChannel[] {
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is NotificationChannel =>
      (ANOMALY_CHANNELS as ReadonlyArray<string>).includes(String(c))
    );
  } catch {
    return [];
  }
}
