/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Field-level A/B experiments — NestJS auth service (Stage 64).
 *
 * Persists experiments, assignments, and exposures via Prisma. The
 * read path goes through `applyExperiment()` which combines Stage 5
 * field permissions with the experiment layer and emits exposures.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  applyExperimentToRead,
  assignVariant,
  buildExposure,
  findVariant,
  summarizeExposures,
  validateExperiment,
} from './field-experiment.service';
import type {
  ExperimentStatus,
  IExperimentAssignment,
  IExperimentExposure,
  IExperimentSummary,
  IFieldExperiment,
} from './field-experiment.types';

@Injectable()
export class FieldExperimentAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate an experiment record. */
  validate(exp: IFieldExperiment): string[] {
    return validateExperiment(exp);
  }

  /** Load an experiment by id. */
  async loadExperiment(id: string): Promise<IFieldExperiment | null> {
    const row = await this.prisma.fieldExperiment.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  /** Persist an experiment record. */
  async persistExperiment(exp: IFieldExperiment): Promise<void> {
    await this.prisma.fieldExperiment.upsert({
      where: { id: exp.id },
      create: {
        id: exp.id,
        baseId: exp.baseId,
        tableId: exp.tableId,
        fieldId: exp.fieldId,
        key: exp.key,
        status: exp.status,
        variants: exp.variants as unknown as object,
        salt: exp.salt,
        startedAt: exp.startedAt ? new Date(exp.startedAt) : null,
        endedAt: exp.endedAt ? new Date(exp.endedAt) : null,
        createdAt: new Date(exp.createdAt),
        updatedAt: new Date(exp.updatedAt),
      },
      update: {
        status: exp.status,
        variants: exp.variants as unknown as object,
        salt: exp.salt,
        startedAt: exp.startedAt ? new Date(exp.startedAt) : null,
        endedAt: exp.endedAt ? new Date(exp.endedAt) : null,
        updatedAt: new Date(exp.updatedAt),
      },
    });
  }

  /** Persist an assignment. */
  async persistAssignment(a: IExperimentAssignment): Promise<void> {
    await this.prisma.fieldExperimentAssignment.upsert({
      where: {
        experimentId_recordId: {
          experimentId: a.experimentId,
          recordId: a.recordId,
        },
      },
      create: {
        experimentId: a.experimentId,
        recordId: a.recordId,
        variantId: a.variantId,
        bucket: a.bucket,
        assignedAt: new Date(a.assignedAt),
      },
      update: {
        variantId: a.variantId,
        bucket: a.bucket,
        assignedAt: new Date(a.assignedAt),
      },
    });
  }

  /** Persist an exposure. */
  async persistExposure(e: IExperimentExposure): Promise<void> {
    await this.prisma.fieldExperimentExposure.create({
      data: {
        experimentId: e.experimentId,
        assignmentId: e.assignmentId,
        recordId: e.recordId,
        variantId: e.variantId,
        outcome: e.outcome ?? null,
        value: typeof e.value === 'number' ? e.value : null,
        observedAt: new Date(e.observedAt),
      },
    });
  }

  /**
   * The single read-path entry point. Resolves the experiment (if any)
   * for the field, computes the assignment, applies the variant, and
   * returns both the value and the exposure so the controller can
   * persist it asynchronously.
   */
  async applyExperiment(input: {
    baseId: string;
    tableId: string;
    fieldId: string;
    recordId: string;
    baseValue: unknown;
  }): Promise<{ value: unknown; exposure: IExperimentExposure | null }> {
    const exp = await this.findActiveExperiment(input.baseId, input.tableId, input.fieldId);
    const { value, exposure } = applyExperimentToRead({
      experiment: exp,
      recordId: input.recordId,
      baseValue: input.baseValue,
    });
    if (!exposure) return { value, exposure: null };
    const fullExposure = buildExposure({ assignment: exposure });
    return { value, exposure: fullExposure };
  }

  /** Compute and persist an assignment row. */
  async assign(input: {
    experiment: IFieldExperiment;
    recordId: string;
  }): Promise<IExperimentAssignment | null> {
    const a = assignVariant(input.experiment, input.recordId);
    if (!a) return null;
    await this.persistAssignment(a);
    return a;
  }

  /** Compute the summary for one experiment. */
  async summarize(experimentId: string): Promise<IExperimentSummary | null> {
    const exp = await this.loadExperiment(experimentId);
    if (!exp) return null;
    const rows = await this.prisma.fieldExperimentExposure.findMany({
      where: { experimentId },
    });
    const exposures: IExperimentExposure[] = rows.map((r) => ({
      experimentId: String(r.experimentId),
      assignmentId: String(r.assignmentId),
      recordId: String(r.recordId),
      variantId: String(r.variantId),
      outcome: r.outcome ?? undefined,
      value: typeof r.value === 'number' ? Number(r.value) : undefined,
      observedAt: r.observedAt.toISOString(),
    }));
    return summarizeExposures({ experiment: exp, exposures });
  }

  /** Find the active experiment for a given field (status = running). */
  private async findActiveExperiment(
    baseId: string,
    tableId: string,
    fieldId: string
  ): Promise<IFieldExperiment | null> {
    const row = await this.prisma.fieldExperiment.findFirst({
      where: { baseId, tableId, fieldId, status: 'running' },
    });
    return row ? toDomain(row) : null;
  }

  /** Pick a variant for a record (used by external jobs that need assignment only). */
  pickVariant(experiment: IFieldExperiment, recordId: string): IExperimentAssignment | null {
    return assignVariant(experiment, recordId);
  }

  /** Get the variant object for an assignment (helper for downstream code). */
  variantFor(experiment: IFieldExperiment, variantId: string) {
    return findVariant(experiment, variantId);
  }

  /** Mark the experiment as completed when there's a clear winner. */
  async completeIfWinner(experimentId: string): Promise<boolean> {
    const summary = await this.summarize(experimentId);
    if (!summary || !summary.treatmentWins) return false;
    const exp = await this.loadExperiment(experimentId);
    if (!exp || exp.status !== 'running') return false;
    const status: ExperimentStatus = 'completed';
    await this.persistExperiment({ ...exp, status, updatedAt: new Date().toISOString() });
    return true;
  }
}

function toDomain(row: Record<string, unknown>): IFieldExperiment {
  const variants = Array.isArray(row['variants'])
    ? (row['variants'] as IFieldExperiment['variants'])
    : [];
  return {
    id: String(row['id']),
    baseId: String(row['baseId']),
    tableId: String(row['tableId']),
    fieldId: String(row['fieldId']),
    key: String(row['key']),
    status: String(row['status']) as IFieldExperiment['status'],
    variants,
    salt: String(row['salt'] ?? ''),
    startedAt: row['startedAt'] ? new Date(String(row['startedAt'])).toISOString() : undefined,
    endedAt: row['endedAt'] ? new Date(String(row['endedAt'])).toISOString() : undefined,
    createdAt: new Date(String(row['createdAt'] ?? Date.now())).toISOString(),
    updatedAt: new Date(String(row['updatedAt'] ?? Date.now())).toISOString(),
  };
}
