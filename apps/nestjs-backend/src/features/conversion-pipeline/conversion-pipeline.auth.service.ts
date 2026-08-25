/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Conversion pipeline DSL — NestJS auth service (Stage 86).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import type { IFieldTypeMap } from '../field-type-map/field-type-map.service';
import { defaultMatrix } from '../field-type-map/field-type-map.service';
import type { FieldDataKind } from '../field-type-map/field-type-map.types';
import {
  appendPipeline,
  reorderSteps,
  runPipeline,
  validatePipeline,
  validateStep,
} from './conversion-pipeline.service';
import type {
  IPipeline,
  IPipelineRun,
  IPipelineStep,
  IStepExecution,
} from './conversion-pipeline.types';

@Injectable()
export class ConversionPipelineAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Save or update a pipeline. */
  async savePipeline(input: { orgId: string; pipeline: IPipeline }): Promise<IPipeline> {
    const err = validatePipeline(input.pipeline);
    if (err) throw new Error(err);
    const id = `${input.orgId}:${input.pipeline.id}`;
    await this.prisma.conversionPipeline.upsert({
      where: { id },
      create: {
        id,
        orgId: input.orgId,
        name: input.pipeline.name,
        /// JSON-encoded IPipelineStep[]
        steps: input.pipeline.steps as object,
      },
      update: {
        name: input.pipeline.name,
        steps: input.pipeline.steps as object,
      },
    });
    return input.pipeline;
  }

  /** Load a stored pipeline. */
  async loadPipeline(orgId: string, pipelineId: string): Promise<IPipeline | null> {
    const row = await this.prisma.conversionPipeline.findUnique({
      where: { id: `${orgId}:${pipelineId}` },
    });
    if (!row) return null;
    return this.rowToPipeline(row);
  }

  /** Run a pipeline on a batch of records. */
  async execute(input: {
    orgId: string;
    pipelineId: string;
    records: Record<string, unknown>[];
    fieldKinds: Record<string, { from: FieldDataKind; to: FieldDataKind }>;
    now: string;
  }): Promise<{
    records: Record<string, unknown>[];
    run: IPipelineRun;
    executions: IStepExecution[];
  }> {
    const pipeline = await this.loadPipeline(input.orgId, input.pipelineId);
    if (!pipeline) throw new Error(`pipeline not found: ${input.pipelineId}`);
    const maps = await this.mapsForOrg(input.orgId);
    return runPipeline({
      pipeline,
      records: input.records,
      maps,
      fieldKinds: input.fieldKinds,
      now: input.now,
    });
  }

  /** Reorder steps within a stored pipeline. */
  async reorderSteps(input: {
    orgId: string;
    pipelineId: string;
    order: string[];
  }): Promise<IPipelineStep[]> {
    const pipeline = await this.loadPipeline(input.orgId, input.pipelineId);
    if (!pipeline) throw new Error(`pipeline not found: ${input.pipelineId}`);
    return reorderSteps({ steps: pipeline.steps, order: input.order });
  }

  validateStep = validateStep;
  validatePipeline = validatePipeline;
  appendPipeline = appendPipeline;

  private async mapsForOrg(orgId: string): Promise<IFieldTypeMap[]> {
    const rows = await this.prisma.fieldTypeMap.findMany({ where: { orgId } });
    const customs = rows.map((r) => ({
      source: r['source'] as FieldDataKind,
      target: r['target'] as FieldDataKind,
      conversion: r['conversion'] as IFieldTypeMap['conversion'],
      lossless: Boolean(r['lossless']),
    }));
    return [...customs, ...defaultMatrix()];
  }

  private rowToPipeline(r: Record<string, unknown>): IPipeline {
    return {
      id: String(r['id']).split(':').slice(1).join(':'),
      name: String(r['name']),
      steps: (r['steps'] as IPipelineStep[]) ?? [],
    };
  }
}
