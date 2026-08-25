/**
 * AI Builder self-feedback — Stage 63.
 *
 * Stage 30 produces proposals. Stage 63 closes the loop: we record whether
 * the user accepted / rejected / edited each proposal, compute edit
 * magnitude (how many fields were renamed, removed, or had their type
 * changed), and turn that history into per-`model` × per-`entityType`
 * metrics. Those metrics feed back into the prompt template used by
 * Stage 30 so future proposals prefer higher-scoring templates.
 */

import type {
  BuilderEntityType,
  BuilderProposalStatus,
  IBuilderFieldProposal,
  IBuilderTableProposal,
} from '../ai-builder/ai-builder.types';

export type FeedbackOutcome = 'accepted' | 'rejected' | 'edited' | 'ignored';

export interface IProposalFeedback {
  proposalId: string;
  baseId: string;
  model: string;
  entityType: BuilderEntityType;
  outcome: FeedbackOutcome;
  /** Edit magnitude 0..1; only meaningful when outcome === 'edited'. */
  editMagnitude: number;
  recordedAt: string;
}

export interface IAiBuilderFeedbackMetrics {
  model: string;
  entityType: BuilderEntityType;
  total: number;
  accepted: number;
  rejected: number;
  edited: number;
  ignored: number;
  /** Acceptance rate over decided outcomes (accepted + edited + rejected). */
  acceptanceRate: number;
  /** Mean edit magnitude across the same decided outcomes. */
  meanEditMagnitude: number;
  /** Effective score used for prompt-template ranking. */
  score: number;
}

export interface IPromptTemplateScore {
  templateId: string;
  model: string;
  entityType: BuilderEntityType;
  score: number;
  /** Number of feedback rows that contributed to this score. */
  sampleSize: number;
  updatedAt: string;
}

export interface IFeedbackSummary {
  baseId: string;
  totalsByModel: Record<string, number>;
  metrics: ReadonlyArray<IAiBuilderFeedbackMetrics>;
}

export interface IEditDiff {
  added: number;
  removed: number;
  renamed: number;
  retype: number;
  totalFields: number;
  magnitude: number;
}

export interface IProposalLike {
  entityType: BuilderEntityType;
  payload: IBuilderTableProposal | IBuilderFieldProposal | IBuilderViewProposalLite;
}

export interface IBuilderViewProposalLite {
  name?: string;
  type?: string;
}

export interface IAggregateFeedbackOptions {
  /** Lower bound on the number of feedback rows before a metric becomes trusted. */
  minSampleSize?: number;
  /** Weight of `meanEditMagnitude` in the final `score`. */
  editMagnitudeWeight?: number;
}

export const DEFAULT_MIN_SAMPLE_SIZE = 5;
export const DEFAULT_EDIT_MAGNITUDE_WEIGHT = 0.5;
export const MAX_PROMPT_TEMPLATE_SCORE = 1.0;
export const MIN_PROMPT_TEMPLATE_SCORE = 0.0;

/**
 * Map a status transition into an outcome. `applied` counts as accepted;
 * `rejected` (without a follow-up `draft`) counts as rejected; edits are
 * detected at recording time by the caller.
 */
export function outcomeFromStatus(status: BuilderProposalStatus, edited: boolean): FeedbackOutcome {
  if (status === 'applied') return 'accepted';
  if (status === 'rejected') return 'rejected';
  if (status === 'approved' && edited) return 'edited';
  if (status === 'approved') return 'accepted';
  return 'ignored';
}

/** A coarse-grained "what kind of edit was made" signature for grouping. */
export type EditSignatureKind =
  | 'rename-field'
  | 'retype-field'
  | 'add-field'
  | 'remove-field'
  | 'rename-view'
  | 'change-view-type'
  | 'other';

export interface IEditSignature {
  kind: EditSignatureKind;
  /** 0..1 — how impactful this particular edit is on the proposal shape. */
  weight: number;
}
