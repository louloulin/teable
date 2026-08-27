/**
 * Model fine-tune pipeline — converts user feedback from
 * `ai-builder-feedback` into fine-tuning datasets for OpenAI and Anthropic.
 *
 * Why a separate pipeline?  Manually pulling feedback rows into JSONL each
 * time you want to retrain is error-prone: the prompt format drifts, you
 * forget to filter out low-quality thumbs-down entries, and you have no
 * audit trail for which training run shipped.  This module is the
 * single, repeatable path: source rows → validated examples → provider-
 * specific JSONL → manifest + SHA → ready-to-upload file.
 *
 * The output is a JSONL file on disk plus a manifest object describing
 * provenance (which feedback rows, which schema snapshot, which dataset
 * version).  Uploading to OpenAI / Anthropic is left to the deployment's
 * training job runner; this module produces the artifact.
 *
 * License: AGPL-3.0
 */

import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

/** A single training example, in OpenAI/Anthropic's shared chat format. */
export interface TrainingExample {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

/** A row from the `ai-builder-feedback` table — what users said about a
 *  specific AI-Builder output. */
export interface FeedbackRow {
  id: string;
  /** The original natural-language prompt the user gave to AI Builder. */
  prompt: string;
  /** The schema (JSON) AI Builder returned. */
  completion: string;
  /** Thumbs up / down; only `up` is exported. */
  rating: 'up' | 'down';
  /** Optional free-text comment from the user; kept for context. */
  comment?: string;
  /** When the feedback was recorded. */
  created_at: string;
}

/** Target provider for the fine-tune file. */
export type FineTuneTarget = 'openai' | 'anthropic';

export interface FineTuneManifest {
  /** Stable dataset version id — content-addressed: SHA256 of the sorted
   *  example IDs. */
  dataset_version: string;
  target: FineTuneTarget;
  example_count: number;
  thumbs_up_count: number;
  thumbs_down_count: number;
  source_min_created_at: string;
  source_max_created_at: string;
  /** SHA256 of the JSONL file on disk, used by the training runner to
   *  skip already-uploaded versions. */
  artifact_sha256: string;
  /** Absolute path to the written JSONL. */
  artifact_path: string;
}

/** Static default system prompt for AI Builder fine-tunes.  Matches the
 *  prompt template shipped in `apps/nestjs-backend/src/features/ai-builder/`. */
const AI_BUILDER_SYSTEM = `You translate natural-language table/field descriptions into a Teable schema (JSON with "fields", "primary", "views"). Prefer plain column types (singleLine/text/number/singleSelect). When the user is ambiguous, make the most common assumption rather than asking.`;

/** Min thumbs-up count to consider a feedback row "good enough" to export. */
const MIN_PROMPT_LENGTH = 12;

/**
 * Convert one feedback row into a single training example.  Returns `null`
 * for rows we should skip (down-voted, too short, malformed). The comment
 * field is folded into the assistant content as a "preferred answer"
 * marker — when present it represents an explicit correction.
 */
export function rowToExample(row: FeedbackRow): TrainingExample | null {
  if (row.rating !== 'up') return null;
  if (row.prompt.length < MIN_PROMPT_LENGTH) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.completion);
  } catch {
    return null;
  }
  // The completion must be a parseable object with at least a fields list.
  if (!parsed || typeof parsed !== 'object') return null;

  const assistant =
    row.comment && row.comment.trim().length > 0
      ? `${row.completion}\n\n<!-- preferred-answer note: ${row.comment.trim()} -->`
      : row.completion;

  return {
    messages: [
      { role: 'system', content: AI_BUILDER_SYSTEM },
      { role: 'user', content: row.prompt },
      { role: 'assistant', content: assistant },
    ],
  };
}

/**
 * Provider-specific JSONL encoding.  The two formats differ in the
 * surrounding envelope but share the same per-example shape; we wrap
 * accordingly so the resulting file can be uploaded directly to the
 * provider's fine-tune endpoint.
 */
export function encodeForTarget(examples: TrainingExample[], target: FineTuneTarget): string {
  const lines = examples.map((ex) => {
    if (target === 'openai') {
      return JSON.stringify({ messages: ex.messages });
    }
    // Anthropic fine-tune format (preview at the time of writing): a
    // "training" envelope whose "messages" array mirrors the chat format.
    return JSON.stringify({ training: { messages: ex.messages } });
  });
  return lines.join('\n') + '\n';
}

/** Build a stable dataset version id from the sorted feedback row ids. */
export function datasetVersionFor(rows: FeedbackRow[]): string {
  const ids = rows.map((r) => r.id).sort();
  return createHash('sha256').update(ids.join('|')).digest('hex').slice(0, 16);
}

export interface BuildResult {
  manifest: FineTuneManifest;
}

/**
 * Main entrypoint — filter + convert + write to disk.  Throws when no
 * rows pass the quality filter (so the training runner gets a clear
 * "nothing to ship" signal rather than silently uploading an empty file).
 */
export function buildFineTuneFile(args: {
  rows: FeedbackRow[];
  target: FineTuneTarget;
  /** Absolute path where the JSONL is written. */
  output_path: string;
}): BuildResult {
  const examples: TrainingExample[] = [];
  let upCount = 0;
  let downCount = 0;
  let minTs = args.rows[0]?.created_at ?? '';
  let maxTs = args.rows[0]?.created_at ?? '';
  const kept: FeedbackRow[] = [];

  for (const row of args.rows) {
    if (row.rating === 'up') upCount++;
    else downCount++;
    if (!minTs || row.created_at < minTs) minTs = row.created_at;
    if (!maxTs || row.created_at > maxTs) maxTs = row.created_at;
    const ex = rowToExample(row);
    if (ex) {
      examples.push(ex);
      kept.push(row);
    }
  }

  if (examples.length === 0) {
    throw new Error(
      `No feedback rows qualified for export (${args.rows.length} input rows, ${upCount} thumbs-up, ${downCount} thumbs-down). Lower MIN_PROMPT_LENGTH or gather more data.`
    );
  }

  const jsonl = encodeForTarget(examples, args.target);
  writeFileSync(args.output_path, jsonl, 'utf8');
  const sha = createHash('sha256').update(jsonl).digest('hex');

  return {
    manifest: {
      dataset_version: datasetVersionFor(kept),
      target: args.target,
      example_count: examples.length,
      thumbs_up_count: upCount,
      thumbs_down_count: downCount,
      source_min_created_at: minTs,
      source_max_created_at: maxTs,
      artifact_sha256: sha,
      artifact_path: args.output_path,
    },
  };
}

/** Default output filename under `/tmp` for ad-hoc CLI usage. */
export function defaultOutputPath(target: FineTuneTarget): string {
  return `/tmp/teable-finetune-${target}-${randomUUID()}.jsonl`;
}
