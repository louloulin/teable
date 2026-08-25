/**
 * AI Builder self-feedback — pure helpers (Stage 63).
 */

import type {
  BuilderEntityType,
  BuilderProposal,
  BuilderProposalStatus,
  IBuilderFieldProposal,
  IBuilderTableProposal,
  IBuilderViewProposal,
} from '../ai-builder/ai-builder.types';
import type {
  IAggregateFeedbackOptions,
  IAiBuilderFeedbackMetrics,
  IEditDiff,
  IEditSignature,
  IFeedbackSummary,
  IPromptTemplateScore,
  IProposalFeedback,
} from './ai-builder-feedback.types';
import {
  DEFAULT_EDIT_MAGNITUDE_WEIGHT,
  DEFAULT_MIN_SAMPLE_SIZE,
  MAX_PROMPT_TEMPLATE_SCORE,
  MIN_PROMPT_TEMPLATE_SCORE,
  outcomeFromStatus,
} from './ai-builder-feedback.types';

export { outcomeFromStatus };

/**
 * Compute edit magnitude between an original proposal and the user's
 * edited version. Returns a value in [0,1] plus a structured diff.
 *
 * The diff covers:
 *   - renamed fields (same type, different name, paired greedily)
 *   - retyped fields (same name, different type)
 *   - added fields (in edited but not original)
 *   - removed fields (in original but not edited)
 */
export function computeEditDiff(original: BuilderProposal, edited: BuilderProposal): IEditDiff {
  if (original.entityType === 'view' || edited.entityType === 'view') {
    return computeViewEditDiff(
      original.payload as IBuilderViewProposal,
      edited.payload as IBuilderViewProposal
    );
  }
  if (original.entityType === 'field' || edited.entityType === 'field') {
    return computeFieldEditDiff(
      original.payload as IBuilderFieldProposal,
      edited.payload as IBuilderFieldProposal
    );
  }
  return computeTableEditDiff(
    original.payload as IBuilderTableProposal,
    edited.payload as IBuilderTableProposal
  );
}

function computeTableEditDiff(
  original: IBuilderTableProposal,
  edited: IBuilderTableProposal
): IEditDiff {
  const originalFields = original.fields;
  const editedFields = edited.fields;
  const originalNames = new Set(originalFields.map((f) => f.name));
  let renamed = 0;
  let retype = 0;
  const usedEdited = new Set<string>();
  const usedOriginal = new Set<string>();
  for (const o of originalFields) {
    const sameName = editedFields.find((e) => e.name === o.name);
    if (sameName && sameName.type !== o.type) {
      retype++;
      usedEdited.add(sameName.name);
      usedOriginal.add(o.name);
    } else if (!sameName) {
      // Pair by type — match the first unused edited field with the same type.
      const maybeRename = editedFields.find((e) => !usedEdited.has(e.name) && e.type === o.type);
      if (maybeRename) {
        renamed++;
        usedEdited.add(maybeRename.name);
        usedOriginal.add(o.name);
      }
    } else {
      usedEdited.add(sameName.name);
      usedOriginal.add(o.name);
    }
  }
  const added = editedFields.filter(
    (f) => !originalNames.has(f.name) && !usedEdited.has(f.name)
  ).length;
  const removed = originalFields.filter((f) => !usedOriginal.has(f.name)).length;
  const totalFields = Math.max(originalFields.length, editedFields.length, 1);
  const magnitude = clamp01((renamed + retype + added + removed) / totalFields);
  return { added, removed, renamed, retype, totalFields, magnitude };
}

function computeFieldEditDiff(
  original: IBuilderFieldProposal,
  edited: IBuilderFieldProposal
): IEditDiff {
  return scalarEditDiff(original.name, edited.name, original.type, edited.type);
}

function computeViewEditDiff(
  original: IBuilderViewProposal,
  edited: IBuilderViewProposal
): IEditDiff {
  return scalarEditDiff(original.name, edited.name, original.type, edited.type);
}

function scalarEditDiff(
  originalName: string,
  editedName: string,
  originalType: string,
  editedType: string
): IEditDiff {
  const renamed = originalName !== editedName ? 1 : 0;
  const retype = originalType !== editedType ? 1 : 0;
  const magnitude = clamp01((renamed + retype) / 2);
  return { added: 0, removed: 0, renamed, retype, totalFields: 1, magnitude };
}

/** Reduce an IEditDiff into a list of coarse-grained signatures for grouping. */
export function diffToSignatures(diff: IEditDiff): IEditSignature[] {
  const out: IEditSignature[] = [];
  if (diff.renamed > 0) {
    out.push({ kind: 'rename-field', weight: diff.renamed / Math.max(diff.totalFields, 1) });
  }
  if (diff.retype > 0) {
    out.push({ kind: 'retype-field', weight: diff.retype / Math.max(diff.totalFields, 1) });
  }
  if (diff.added > 0) {
    out.push({ kind: 'add-field', weight: diff.added / Math.max(diff.totalFields, 1) });
  }
  if (diff.removed > 0) {
    out.push({ kind: 'remove-field', weight: diff.removed / Math.max(diff.totalFields, 1) });
  }
  if (out.length === 0) out.push({ kind: 'other', weight: 0 });
  return out;
}

/** Convert a feedback row into a status + edit-magnitude pair. */
export function buildFeedbackRow(input: {
  proposalId: string;
  baseId: string;
  model: string;
  entityType: BuilderEntityType;
  status: BuilderProposalStatus;
  edited: boolean;
  editMagnitude?: number;
  recordedAt?: string;
}): IProposalFeedback {
  const outcome = outcomeFromStatus(input.status, input.edited);
  const editMagnitude = clamp01(input.editMagnitude ?? 0);
  return {
    proposalId: input.proposalId,
    baseId: input.baseId,
    model: input.model,
    entityType: input.entityType,
    outcome,
    editMagnitude: outcome === 'edited' ? editMagnitude : 0,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
}

/** Group feedback rows by `model × entityType`. */
export function groupByModelEntityType(
  rows: ReadonlyArray<IProposalFeedback>
): Map<string, IProposalFeedback[]> {
  const out = new Map<string, IProposalFeedback[]>();
  for (const r of rows) {
    const key = `${r.model}|${r.entityType}`;
    const list = out.get(key);
    if (list) list.push(r);
    else out.set(key, [r]);
  }
  return out;
}

/** Internal: parse a group key produced by `groupByModelEntityType`. */
export function parseGroupKey(key: string): { model: string; entityType: BuilderEntityType } {
  const idx = key.indexOf('|');
  return {
    model: key.slice(0, idx),
    entityType: key.slice(idx + 1) as BuilderEntityType,
  };
}

/** Compute aggregate metrics for one model × entityType bucket. */
export function aggregateBucket(
  model: string,
  entityType: BuilderEntityType,
  rows: ReadonlyArray<IProposalFeedback>,
  opts: IAggregateFeedbackOptions = {}
): IAiBuilderFeedbackMetrics {
  const editMagnitudeWeight = clamp01(opts.editMagnitudeWeight ?? DEFAULT_EDIT_MAGNITUDE_WEIGHT);
  const total = rows.length;
  let accepted = 0;
  let rejected = 0;
  let edited = 0;
  let ignored = 0;
  let editMagnitudeSum = 0;
  for (const r of rows) {
    if (r.outcome === 'accepted') accepted++;
    else if (r.outcome === 'rejected') rejected++;
    else if (r.outcome === 'edited') {
      edited++;
      editMagnitudeSum += r.editMagnitude;
    } else ignored++;
  }
  const decided = accepted + edited + rejected;
  const acceptanceRate = decided === 0 ? 0 : (accepted + edited) / decided;
  const editedShare = decided === 0 ? 0 : edited / decided;
  const meanEditMagnitude = edited === 0 ? 0 : editMagnitudeSum / edited;
  const score = clamp01(
    acceptanceRate * (1 - editMagnitudeWeight * meanEditMagnitude) +
      editedShare * 0.5 * (1 - meanEditMagnitude)
  );
  return {
    model,
    entityType,
    total,
    accepted,
    rejected,
    edited,
    ignored,
    acceptanceRate,
    meanEditMagnitude,
    score,
  };
}

/** Decide whether a metric bucket has enough samples to be trusted. */
export function isTrusted(
  m: IAiBuilderFeedbackMetrics,
  opts: IAggregateFeedbackOptions = {}
): boolean {
  const min = opts.minSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE;
  return m.total >= min;
}

/** Rank metrics by score, descending. Stable tie-break on model+entityType. */
export function rankMetrics(
  metrics: ReadonlyArray<IAiBuilderFeedbackMetrics>
): IAiBuilderFeedbackMetrics[] {
  return [...metrics].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.model !== b.model) return a.model.localeCompare(b.model);
    return a.entityType.localeCompare(b.entityType);
  });
}

/** Compose a base-level summary from a flat feedback log. */
export function summarize(
  baseId: string,
  rows: ReadonlyArray<IProposalFeedback>,
  opts: IAggregateFeedbackOptions = {}
): IFeedbackSummary {
  const baseRows = rows.filter((r) => r.baseId === baseId);
  const grouped = groupByModelEntityType(baseRows);
  const metrics: IAiBuilderFeedbackMetrics[] = [];
  const totalsByModel: Record<string, number> = {};
  for (const [key, list] of grouped) {
    const { model, entityType } = parseGroupKey(key);
    metrics.push(aggregateBucket(model, entityType, list, opts));
    totalsByModel[model] = (totalsByModel[model] ?? 0) + list.length;
  }
  return { baseId, totalsByModel, metrics: rankMetrics(metrics) };
}

/** Pick the preferred model for an entityType given current metrics. */
export function pickPreferredModel(
  metrics: ReadonlyArray<IAiBuilderFeedbackMetrics>,
  entityType: BuilderEntityType,
  opts: IAggregateFeedbackOptions = {}
): string | null {
  const candidates = metrics.filter((m) => m.entityType === entityType && isTrusted(m, opts));
  if (candidates.length === 0) return null;
  const top = rankMetrics(candidates)[0];
  return top?.model ?? null;
}

/** Convert an aggregate bucket into a PromptTemplateScore. */
export function metricToTemplateScore(
  templateId: string,
  m: IAiBuilderFeedbackMetrics
): IPromptTemplateScore {
  return {
    templateId,
    model: m.model,
    entityType: m.entityType,
    score: clamp(m.score, MIN_PROMPT_TEMPLATE_SCORE, MAX_PROMPT_TEMPLATE_SCORE),
    sampleSize: m.total,
    updatedAt: new Date().toISOString(),
  };
}

/** Decide whether a new template score is an improvement over the previous one. */
export function isScoreImprovement(
  prev: IPromptTemplateScore | null,
  next: IPromptTemplateScore
): boolean {
  if (!prev) return true;
  if (next.sampleSize > prev.sampleSize && next.score >= prev.score) return true;
  return next.score - prev.score > 0.05;
}

/** Blend the system prompt with model-specific guidance when a preferred model exists. */
export function applyFeedbackToPrompt(input: {
  basePrompt: string;
  preferredModel: string | null;
  entityType: BuilderEntityType;
  metrics?: ReadonlyArray<IAiBuilderFeedbackMetrics>;
}): string {
  if (!input.preferredModel) return input.basePrompt;
  const m = input.metrics?.find(
    (x) => x.model === input.preferredModel && x.entityType === input.entityType
  );
  const extra =
    m && m.meanEditMagnitude > 0
      ? ` Prior performance for ${input.entityType} on model ${input.preferredModel}: ${(
          m.acceptanceRate * 100
        ).toFixed(1)}% acceptance, ${(m.meanEditMagnitude * 100).toFixed(0)}% mean edit magnitude.`
      : ` Prefer ${input.preferredModel} for ${input.entityType} proposals.`;
  return `${input.basePrompt}${extra}`;
}

/** Hash a prompt template id from a (model, entityType) pair so callers can map back. */
export function buildTemplateId(model: string, entityType: BuilderEntityType): string {
  return `${model}::${entityType}`;
}

// --- internals ---------------------------------------------------------

function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function clamp(x: number, lo: number, hi: number): number {
  if (Number.isNaN(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}
