/**
 * Field-level A/B experiments — Stage 64.
 *
 * A/B experiments at the field level let a workspace run two or more
 * variants of a *display value* (e.g. AI summarization prompt, scoring
 * formula, recommendation ranker) over the same set of records and
 * compare outcomes. Experiments are bound to a base + a field; each
 * record that the experiment covers receives a sticky assignment to
 * one variant, weighted by `allocation`. Combined with Stage 5 field
 * permissions, the read path can return either the control value or
 * the variant value, plus an exposure event for downstream analytics.
 */

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

export type ExperimentVariantKind = 'control' | 'treatment';

export interface IExperimentVariant {
  id: string;
  /** Human label, e.g. "control", "prompt v2". */
  label: string;
  kind: ExperimentVariantKind;
  /** Optional weight override; when 0 the variant is paused but kept in allocation map. */
  weight: number;
  /** Optional payload the controller can interpolate into the read path. */
  payload?: Record<string, unknown>;
}

export interface IFieldExperiment {
  id: string;
  baseId: string;
  tableId: string;
  fieldId: string;
  /** Stable key used by analytics to join exposures. */
  key: string;
  status: ExperimentStatus;
  variants: ReadonlyArray<IExperimentVariant>;
  /** Salt for the assignment hash. Re-roll when you want to re-randomise. */
  salt: string;
  startedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IExperimentAssignment {
  experimentId: string;
  recordId: string;
  variantId: string;
  /** Deterministic 0..1 hash used to decide the variant. */
  bucket: number;
  assignedAt: string;
}

export interface IExperimentExposure {
  experimentId: string;
  assignmentId: string;
  recordId: string;
  variantId: string;
  /** Optional outcome tag — set by the caller, e.g. "click", "convert". */
  outcome?: string;
  /** Optional numeric value — set by the caller, e.g. revenue or score. */
  value?: number;
  observedAt: string;
}

export interface IExperimentSummary {
  experimentId: string;
  variants: ReadonlyArray<{
    variantId: string;
    exposures: number;
    conversions: number;
    meanValue: number;
    /** Conversion rate; 0 when no exposures yet. */
    conversionRate: number;
  }>;
  /** Whether the treatment variant beat control by more than the configured min lift. */
  treatmentWins: boolean;
  /** Recommended variant id (control when no clear winner). */
  recommendedVariantId: string;
}

export interface IAssignmentOptions {
  /** When true, the same record will always land in the same variant for a given salt. */
  sticky?: boolean;
}

export const DEFAULT_STICKY = true;
export const MAX_EXPERIMENT_VARIANTS = 8;
export const MIN_EXPERIMENT_WEIGHT = 0;
export const MAX_EXPERIMENT_WEIGHT = 1_000_000;
export const DEFAULT_MIN_LIFT = 0.02;

/** Default value used when the read path doesn't get an explicit override. */
export const DEFAULT_OUTCOME_TAG = 'exposure';
