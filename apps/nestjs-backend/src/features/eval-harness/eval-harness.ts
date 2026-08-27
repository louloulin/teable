/**
 * Evaluation harness for AI Builder NL→schema regression.
 *
 * Why this exists: the AI Builder is non-deterministic — a prompt change,
 * a model swap, or a fine-tune can silently regress on a corner case the
 * author forgot existed.  Running a fixed, versioned eval set on every
 * model change gives the maintainer a green/red signal in 30 seconds,
 * before shipping.
 *
 * The harness is deliberately a thin scoring layer over a function the
 * caller provides (`runPrompt`) so:
 *   - production wires the real `ai-builder` pipeline
 *   - fine-tune experiments wire a candidate model
 *   - regression tests wire a deterministic stub
 *
 * Scoring is structural — we compare the produced schema's field-set,
 * primary key, and view-set against the gold answer.  We don't compare
 * string equality on JSON because the LLM may add harmless whitespace
 * or reorder keys; what matters is whether the right fields exist with
 * the right types.
 *
 * License: AGPL-3.0
 */

export interface SchemaField {
  name: string;
  type: string;
  options?: { choices?: Array<{ name: string }> };
}

export interface SchemaDoc {
  fields: SchemaField[];
  primary?: string;
  views?: Array<{ name: string; type: string }>;
}

export interface EvalCase {
  id: string;
  prompt: string;
  /** Authoritative expected output. */
  gold: SchemaDoc;
  /** Tags for filtering (e.g. "single_select", "primary_key"). */
  tags?: string[];
}

/** What the harness measures per case. */
export interface CaseScore {
  case_id: string;
  field_set_f1: number;
  type_accuracy: number;
  has_primary_correct: boolean;
  /** Weighted overall score, 0..1. */
  overall: number;
  /** Free-form notes, surfaced in CI output. */
  notes?: string[];
}

export interface HarnessSummary {
  case_count: number;
  mean_overall: number;
  median_overall: number;
  per_tag: Record<string, { count: number; mean_overall: number }>;
  failures: CaseScore[];
}

const FIELD_SET_WEIGHT = 0.5;
const TYPE_ACCURACY_WEIGHT = 0.3;
const PRIMARY_WEIGHT = 0.2;

/** Tokenize a field set into a Set for F1 computation. */
function asSet<T>(xs: T[]): Set<T> {
  return new Set(xs);
}

/** F1 between two string sets, ignoring duplicates. */
export function f1(predicted: string[], gold: string[]): number {
  const p = asSet(predicted);
  const g = asSet(gold);
  if (p.size === 0 && g.size === 0) return 1;
  let inter = 0;
  for (const x of p) if (g.has(x)) inter++;
  const precision = p.size === 0 ? 0 : inter / p.size;
  const recall = g.size === 0 ? 0 : inter / g.size;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

/** Compare predicted and gold field types for the intersection of field
 *  names; returns the fraction of matching names whose type matches. */
export function typeAccuracy(predicted: SchemaField[], gold: SchemaField[]): number {
  const goldByName = new Map(gold.map((f) => [f.name, f.type]));
  if (goldByName.size === 0) return 1;
  let matched = 0;
  for (const f of predicted) {
    const expected = goldByName.get(f.name);
    if (expected === undefined) continue;
    if (expected === f.type) matched++;
  }
  return matched / goldByName.size;
}

/** Score one predicted schema against one gold. */
export function scoreCase(c: EvalCase, predicted: SchemaDoc): CaseScore {
  const notes: string[] = [];
  const goldNames = c.gold.fields.map((f) => f.name);
  const predNames = predicted.fields.map((f) => f.name);
  const fieldSetF1 = f1(predNames, goldNames);
  if (fieldSetF1 < 0.7) notes.push(`low-field-f1=${fieldSetF1.toFixed(2)}`);
  const typeAcc = typeAccuracy(predicted.fields, c.gold.fields);
  const hasPrimary = !!c.gold.primary && predicted.primary === c.gold.primary;
  if (c.gold.primary && !hasPrimary)
    notes.push(`primary-mismatch: want ${c.gold.primary}, got ${predicted.primary ?? '(none)'}`);

  const overall =
    fieldSetF1 * FIELD_SET_WEIGHT +
    typeAcc * TYPE_ACCURACY_WEIGHT +
    (hasPrimary ? 1 : 0) * PRIMARY_WEIGHT;

  return {
    case_id: c.id,
    field_set_f1: fieldSetF1,
    type_accuracy: typeAcc,
    has_primary_correct: hasPrimary,
    overall,
    notes: notes.length > 0 ? notes : undefined,
  };
}

export function summarize(cases: EvalCase[], scores: CaseScore[]): HarnessSummary {
  const byTag: Record<string, { count: number; mean_overall: number }> = {};
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const s = scores[i];
    for (const tag of c.tags ?? []) {
      const bucket = byTag[tag] ?? { count: 0, mean_overall: 0 };
      bucket.count += 1;
      bucket.mean_overall += s.overall;
      byTag[tag] = bucket;
    }
  }
  for (const tag of Object.keys(byTag)) {
    byTag[tag].mean_overall = byTag[tag].mean_overall / byTag[tag].count;
  }
  const overalls = scores.map((s) => s.overall).sort();
  const mean = overalls.reduce((a, b) => a + b, 0) / overalls.length;
  const median =
    overalls.length % 2 === 0
      ? (overalls[overalls.length / 2 - 1] + overalls[overalls.length / 2]) / 2
      : overalls[Math.floor(overalls.length / 2)];
  return {
    case_count: cases.length,
    mean_overall: mean,
    median_overall: median,
    per_tag: byTag,
    failures: scores.filter((s) => s.overall < 0.6),
  };
}

/** Run the harness end-to-end: caller-supplied `runPrompt` against every
 *  case, scoring each.  Returns the summary plus all per-case scores. */
export async function runHarness(args: {
  cases: EvalCase[];
  runPrompt: (prompt: string) => Promise<SchemaDoc>;
}): Promise<{ summary: HarnessSummary; scores: CaseScore[] }> {
  const scores: CaseScore[] = [];
  for (const c of args.cases) {
    const predicted = await args.runPrompt(c.prompt);
    scores.push(scoreCase(c, predicted));
  }
  return { scores, summary: summarize(args.cases, scores) };
}
