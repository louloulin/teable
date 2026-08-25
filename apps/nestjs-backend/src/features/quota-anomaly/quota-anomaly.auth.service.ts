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
}
