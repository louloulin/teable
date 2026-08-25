/**
 * Field-level A/B experiments — pure helpers (Stage 64).
 */

import { createHash } from 'node:crypto';

import type {
  ExperimentStatus,
  IAssignmentOptions,
  IExperimentAssignment,
  IExperimentExposure,
  IExperimentSummary,
  IExperimentVariant,
  IFieldExperiment,
} from './field-experiment.types';
import {
  DEFAULT_MIN_LIFT,
  DEFAULT_STICKY,
  MAX_EXPERIMENT_VARIANTS,
} from './field-experiment.types';

export const DEFAULT_OUTCOME_FOR_CONVERSION = 'convert';

/**
 * Compute a deterministic 0..1 hash for `(salt, recordId)`. Stable across
 * processes and machines; cheap enough to compute on every read.
 */
export function bucketize(salt: string, recordId: string): number {
  const h = createHash('sha256').update(`${salt}|${recordId}`).digest();
  // Read the first 6 bytes as an unsigned integer (max ≈ 2^48), then divide.
  const slice = h.subarray(0, 6);
  let n = 0;
  for (const b of slice) n = (n << 8) | b;
  return Math.abs(n) / 0xffffffffffff;
}

/**
 * Pick a variant for a record using weighted allocation. Returns null when
 * the experiment is not eligible (draft/paused/archived, or no usable
 * variants).
 */
export function assignVariant(
  experiment: IFieldExperiment,
  recordId: string,
  opts: IAssignmentOptions = {}
): IExperimentAssignment | null {
  if (experiment.status !== 'running') return null;
  const eligible = experiment.variants.filter((v) => v.weight > 0);
  if (eligible.length === 0) return null;
  const total = eligible.reduce((s, v) => s + v.weight, 0);
  if (total <= 0) return null;
  const sticky = opts.sticky ?? DEFAULT_STICKY;
  const bucket = bucketize(
    sticky ? experiment.salt : `${experiment.salt}|${experiment.updatedAt}`,
    recordId
  );
  let cursor = bucket * total;
  let chosen: IExperimentVariant | undefined;
  for (const v of eligible) {
    if (cursor < v.weight) {
      chosen = v;
      break;
    }
    cursor -= v.weight;
  }
  if (!chosen) chosen = eligible[eligible.length - 1];
  if (!chosen) return null;
  return {
    experimentId: experiment.id,
    recordId,
    variantId: chosen.id,
    bucket,
    assignedAt: new Date().toISOString(),
  };
}

/** Validate an experiment payload. Throws on the first violation. */
export function validateExperiment(exp: IFieldExperiment): string[] {
  const errs: string[] = [];
  validateRequiredFields(exp, errs);
  validateVariantCount(exp, errs);
  validateVariantShape(exp.variants, errs);
  return errs;
}

function validateRequiredFields(exp: IFieldExperiment, errs: string[]): void {
  if (!exp.id) errs.push('id is required');
  if (!exp.baseId) errs.push('baseId is required');
  if (!exp.tableId) errs.push('tableId is required');
  if (!exp.fieldId) errs.push('fieldId is required');
  if (!exp.key) errs.push('key is required');
}

function validateVariantCount(exp: IFieldExperiment, errs: string[]): void {
  if (exp.variants.length === 0) errs.push('at least one variant is required');
  if (exp.variants.length > MAX_EXPERIMENT_VARIANTS) {
    errs.push(`too many variants (${exp.variants.length} > ${MAX_EXPERIMENT_VARIANTS})`);
  }
}

function validateVariantShape(variants: ReadonlyArray<IExperimentVariant>, errs: string[]): void {
  const seen = new Set<string>();
  let controlCount = 0;
  for (const v of variants) {
    if (!v.id) errs.push('variant id is required');
    if (seen.has(v.id)) errs.push(`duplicate variant id: ${v.id}`);
    seen.add(v.id);
    if (!v.label) errs.push(`variant ${v.id}: label required`);
    if (v.weight < 0) errs.push(`variant ${v.id}: weight must be ≥ 0`);
    if (v.kind === 'control') controlCount++;
  }
  if (controlCount > 1) errs.push('only one control variant is allowed');
}

const VALID_TRANSITIONS: Record<ExperimentStatus, ReadonlyArray<ExperimentStatus>> = {
  draft: ['running', 'archived'],
  running: ['paused', 'completed'],
  paused: ['running', 'completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

/** Whether a status transition is allowed. */
export function isValidExperimentTransition(from: ExperimentStatus, to: ExperimentStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Find the variant with the given id (or undefined). */
export function findVariant(
  experiment: IFieldExperiment,
  variantId: string
): IExperimentVariant | undefined {
  return experiment.variants.find((v) => v.id === variantId);
}

/** Build the canonical exposure payload for a record read. */
export function buildExposure(input: {
  assignment: IExperimentAssignment;
  outcome?: string;
  value?: number;
  observedAt?: string;
}): IExperimentExposure {
  return {
    experimentId: input.assignment.experimentId,
    assignmentId: `${input.assignment.experimentId}:${input.assignment.recordId}`,
    recordId: input.assignment.recordId,
    variantId: input.assignment.variantId,
    ...(input.outcome !== undefined ? { outcome: input.outcome } : {}),
    ...(input.value !== undefined ? { value: input.value } : {}),
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}

/**
 * Decide whether the experiment should advance. Used by the controller
 * to flip `running → completed` automatically when there's a clear
 * winner and the test was a 2-arm experiment.
 */
export function shouldAutoComplete(summary: IExperimentSummary): boolean {
  if (!summary.treatmentWins) return false;
  return summary.variants.length === 2;
}

/** Compute the conversion summary for one experiment from its exposures. */
export function summarizeExposures(input: {
  experiment: IFieldExperiment;
  exposures: ReadonlyArray<IExperimentExposure>;
  minLift?: number;
}): IExperimentSummary {
  const lift = input.minLift ?? DEFAULT_MIN_LIFT;
  const buckets = buildExposureBuckets(input.experiment.variants);
  accumulateExposures(buckets, input.exposures);
  const perVariant = toPerVariant(input.experiment.variants, buckets);
  const winner = pickWinner(input.experiment.variants, perVariant, lift);
  return {
    experimentId: input.experiment.id,
    variants: perVariant,
    treatmentWins: winner.treatmentWins,
    recommendedVariantId: winner.recommended,
  };
}

function buildExposureBuckets(
  variants: ReadonlyArray<IExperimentVariant>
): Map<string, { exposures: number; conversions: number; sumValue: number }> {
  const buckets = new Map<string, { exposures: number; conversions: number; sumValue: number }>();
  for (const v of variants) {
    buckets.set(v.id, { exposures: 0, conversions: 0, sumValue: 0 });
  }
  return buckets;
}

function accumulateExposures(
  buckets: Map<string, { exposures: number; conversions: number; sumValue: number }>,
  exposures: ReadonlyArray<IExperimentExposure>
): void {
  for (const e of exposures) {
    const b = buckets.get(e.variantId);
    if (!b) continue;
    b.exposures++;
    if (e.outcome && e.outcome !== 'exposure') b.conversions++;
    if (typeof e.value === 'number') b.sumValue += e.value;
  }
}

function toPerVariant(
  variants: ReadonlyArray<IExperimentVariant>,
  buckets: Map<string, { exposures: number; conversions: number; sumValue: number }>
): IExperimentSummary['variants'] {
  return variants.map((v) => {
    const b = buckets.get(v.id) ?? { exposures: 0, conversions: 0, sumValue: 0 };
    return {
      variantId: v.id,
      exposures: b.exposures,
      conversions: b.conversions,
      meanValue: b.exposures === 0 ? 0 : b.sumValue / b.exposures,
      conversionRate: b.exposures === 0 ? 0 : b.conversions / b.exposures,
    };
  });
}

function pickWinner(
  variants: ReadonlyArray<IExperimentVariant>,
  perVariant: IExperimentSummary['variants'],
  lift: number
): { treatmentWins: boolean; recommended: string } {
  const control = variants.find((v) => v.kind === 'control');
  const fallback = control?.id ?? variants[0]?.id ?? '';
  if (!control) return { treatmentWins: false, recommended: fallback };
  const controlSummary = perVariant.find((p) => p.variantId === control.id);
  if (!controlSummary) return { treatmentWins: false, recommended: fallback };
  let recommended = fallback;
  let treatmentWins = false;
  for (const v of variants) {
    if (v.kind === 'control') continue;
    const tp = perVariant.find((p) => p.variantId === v.id);
    if (!tp) continue;
    const liftObserved = tp.conversionRate - controlSummary.conversionRate;
    if (liftObserved >= lift && tp.conversions > 0) {
      treatmentWins = true;
      recommended = v.id;
    }
  }
  return { treatmentWins, recommended };
}

/**
 * Combine the read path with the experiment layer: returns either the
 * raw field value (when no experiment is running) or a wrapped value
 * annotated with the chosen variant. The caller decides whether to swap
 * in the variant payload (e.g. an alternate prompt).
 */
export function applyExperimentToRead(input: {
  experiment: IFieldExperiment | null;
  recordId: string;
  baseValue: unknown;
}): { value: unknown; exposure: IExperimentAssignment | null } {
  if (!input.experiment) return { value: input.baseValue, exposure: null };
  if (input.experiment.status !== 'running') {
    return { value: input.baseValue, exposure: null };
  }
  const assignment = assignVariant(input.experiment, input.recordId);
  if (!assignment) return { value: input.baseValue, exposure: null };
  const variant = findVariant(input.experiment, assignment.variantId);
  if (!variant || variant.kind === 'control') {
    return { value: input.baseValue, exposure: assignment };
  }
  return {
    value: variant.payload ? { base: input.baseValue, variant } : input.baseValue,
    exposure: assignment,
  };
}

/** Stable hash used to derive the experiment id when one isn't supplied. */
export function deriveExperimentKey(input: {
  baseId: string;
  tableId: string;
  fieldId: string;
  purpose: string;
}): string {
  return createHash('sha256')
    .update(`${input.baseId}|${input.tableId}|${input.fieldId}|${input.purpose}`)
    .digest('hex')
    .slice(0, 16);
}
