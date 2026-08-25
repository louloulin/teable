/**
 * AI Builder self-feedback — NestJS auth service (Stage 63).
 *
 * Persists feedback rows via Prisma and exposes the high-level
 * `record()` / `summarize()` entry points used by the controller layer.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import type { BuilderEntityType, BuilderProposalStatus } from '../ai-builder/ai-builder.types';
import {
  buildFeedbackRow,
  buildTemplateId,
  isTrusted,
  metricToTemplateScore,
  pickPreferredModel,
  summarize,
} from './ai-builder-feedback.service';
import type {
  IAggregateFeedbackOptions,
  IAiBuilderFeedbackMetrics,
  IFeedbackSummary,
  IProposalFeedback,
  IPromptTemplateScore,
} from './ai-builder-feedback.types';

@Injectable()
export class AiBuilderFeedbackAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build an in-memory feedback row from proposal state + edit flag.
   * Persistence happens in `persist()` so tests can call `record()` to
   * inspect the value before commit.
   */
  record(input: {
    proposalId: string;
    baseId: string;
    model: string;
    entityType: BuilderEntityType;
    status: BuilderProposalStatus;
    edited: boolean;
    editMagnitude?: number;
  }): IProposalFeedback {
    return buildFeedbackRow(input);
  }

  /** Persist a feedback row. */
  async persist(row: IProposalFeedback): Promise<void> {
    await this.prisma.aiBuilderFeedback.create({
      data: {
        proposalId: row.proposalId,
        baseId: row.baseId,
        model: row.model,
        entityType: row.entityType,
        outcome: row.outcome,
        editMagnitude: row.editMagnitude,
        recordedAt: new Date(row.recordedAt),
      },
    });
  }

  /** Load every feedback row for a base, oldest-first. */
  async loadForBase(baseId: string): Promise<IProposalFeedback[]> {
    const rows = await this.prisma.aiBuilderFeedback.findMany({
      where: { baseId },
      orderBy: { recordedAt: 'asc' },
    });
    return rows.map((r) => ({
      proposalId: String(r.proposalId),
      baseId: String(r.baseId),
      model: String(r.model),
      entityType: String(r.entityType) as BuilderEntityType,
      outcome: String(r.outcome) as IProposalFeedback['outcome'],
      editMagnitude: Number(r.editMagnitude ?? 0),
      recordedAt: r.recordedAt.toISOString(),
    }));
  }

  /** Build a summary from a base's feedback rows. */
  async summarize(baseId: string, opts: IAggregateFeedbackOptions = {}): Promise<IFeedbackSummary> {
    const rows = await this.loadForBase(baseId);
    return summarize(baseId, rows, opts);
  }

  /** Pick the best model for an entityType given current summary metrics. */
  async preferredModel(
    baseId: string,
    entityType: BuilderEntityType,
    opts: IAggregateFeedbackOptions = {}
  ): Promise<string | null> {
    const s = await this.summarize(baseId, opts);
    return pickPreferredModel(s.metrics, entityType, opts);
  }

  /**
   * Build the current set of prompt-template scores for the base, so
   * downstream Stage 30 callers can rank their templates.
   */
  async templateScores(
    baseId: string,
    opts: IAggregateFeedbackOptions = {}
  ): Promise<IPromptTemplateScore[]> {
    const s = await this.summarize(baseId, opts);
    const out: IPromptTemplateScore[] = [];
    for (const m of s.metrics) {
      out.push(metricToTemplateScore(buildTemplateId(m.model, m.entityType), m));
    }
    return out.filter((t) => isTrusted(asMetric(s.metrics, t.model, t.entityType), opts));
  }
}

function asMetric(
  metrics: ReadonlyArray<IAiBuilderFeedbackMetrics>,
  model: string,
  entityType: BuilderEntityType
): IAiBuilderFeedbackMetrics {
  const found = metrics.find((m) => m.model === model && m.entityType === entityType);
  return (
    found ?? {
      model,
      entityType,
      total: 0,
      accepted: 0,
      rejected: 0,
      edited: 0,
      ignored: 0,
      acceptanceRate: 0,
      meanEditMagnitude: 0,
      score: 0,
    }
  );
}
