/**
 * Conversion pipeline DSL — types (Stage 86).
 */

import type { FieldConversion } from '../field-type-map/field-type-map.types';

export interface IPipelineFilter {
  field: string;
  /** Compare the field's value to the literal using 'eq'/'ne'/'in'/'contains'. */
  op: 'eq' | 'ne' | 'in' | 'contains';
  value: unknown;
}

export interface IPipelineStep {
  id: string;
  sourceField: string;
  targetField: string;
  conversion: FieldConversion;
  when?: IPipelineFilter;
}

export interface IPipeline {
  id: string;
  name: string;
  steps: IPipelineStep[];
}

export interface IStepExecution {
  stepId: string;
  ok: boolean;
  error?: string;
  valueBefore: unknown;
  valueAfter: unknown;
}

export interface IPipelineRun {
  pipelineId: string;
  recordCount: number;
  stepCount: number;
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  failures: number;
}

export const MAX_STEPS_PER_PIPELINE = 64;
export const MAX_PIPELINES_PER_ORG = 256;
