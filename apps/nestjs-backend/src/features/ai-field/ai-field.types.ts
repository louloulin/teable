/**
 * AI field (autoClassify/Summarize/Translate) — Stage 31 types.
 *
 * Per-field AI configuration with model, prompt template,
 * operation-specific config (labels/target language/max length),
 * per-run token usage audit, and shared template library.
 */

export type AiFieldOperation = 'classify' | 'summarize' | 'translate' | 'score' | 'image' | 'custom';

export type AiFieldStatus = 'enabled' | 'paused' | 'error';

export type AiRunStatus = 'ok' | 'failed' | 'rate-limited' | 'skipped';

export interface IClassifyConfig {
  labels: ReadonlyArray<string>;
  /** Optional hint passed into the prompt to bias classification. */
  description?: string;
  /** Allow multiple labels per record; default false → top-1. */
  multiLabel?: boolean;
}

export interface ISummarizeConfig {
  maxLength?: number;
  style?: 'concise' | 'detailed' | 'bullets';
  language?: string;
}

export interface ITranslateConfig {
  targetLang: string;
  sourceLang?: string;
  preserveFormatting?: boolean;
}

export interface IScoreConfig {
  /** Inclusive lower bound of the score scale. */
  min: number;
  /** Inclusive upper bound of the score scale. */
  max: number;
  /** Optional scoring rubric / criteria passed into the prompt. */
  criteria?: string;
  /** Optional human-readable description of what is being scored. */
  description?: string;
}

export interface IImageConfig {
  /** Text prompt describing the image to generate. */
  prompt: string;
  /** Output size, e.g. '1024x1024' (provider-dependent). */
  size?: string;
  /** Number of images to generate per run; default 1. */
  count?: number;
  /** Aspect ratio, e.g. '1:1' (provider-dependent). */
  aspectRatio?: string;
  /** Quality hint, e.g. 'standard' | 'hd' (provider-dependent). */
  quality?: string;
}

export interface ICustomPromptConfig {
  /**
   * User-provided prompt template. Supports `{{fieldName}}` placeholders
   * that resolve to the value of the same-named source field for each row.
   * Placeholder resolution is forgiving: unknown names resolve to empty string.
   */
  prompt: string;
  /** Optional system prompt prepended to the user message. */
  systemPrompt?: string;
  /** Optional language for bilingual templates ("english" | "chinese"). */
  language?: string;
}

export type AiFieldConfig =
  | IClassifyConfig
  | ISummarizeConfig
  | ITranslateConfig
  | IScoreConfig
  | IImageConfig
  | ICustomPromptConfig;

export interface IAiField {
  id: string;
  baseId: string;
  tableId: string;
  fieldId: string;
  operation: AiFieldOperation;
  model: string;
  sourceFieldIds: string;
  configJson: string;
  configHash: string;
  status: AiFieldStatus;
  lastRunAt: Date | null;
  lastErrorMessage: string | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}

export interface IAiFieldRun {
  id: string;
  aiFieldId: string;
  recordId: string;
  status: AiRunStatus;
  inputText: string;
  outputText: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  durationMs: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface IAiFieldTemplate {
  id: string;
  operation: AiFieldOperation;
  language: string;
  name: string;
  promptTemplate: string;
  description: string | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
}

export interface ICreateAiFieldInput {
  baseId: string;
  tableId: string;
  fieldId: string;
  operation: AiFieldOperation;
  model: string;
  sourceFieldIds: ReadonlyArray<string>;
  config: AiFieldConfig;
  createdBy: string;
}

export interface IUpdateAiFieldInput {
  model?: string;
  sourceFieldIds?: ReadonlyArray<string>;
  config?: AiFieldConfig;
  status?: AiFieldStatus;
}

export interface IRunAiFieldInput {
  aiFieldId: string;
  recordId: string;
  inputText: string;
  /** Caller-provided stub output (for tests + dry-runs). */
  stubOutput?: string;
  /** Bypass automatic deduplication for an explicit manual rerun. */
  force?: boolean;
  /**
   * Full row fields for custom-prompt placeholder resolution
   * (`{{fieldName}}` → fields[name]). Optional; when omitted, the auth
   * service falls back to using `inputText` as the sole variable.
   */
  rowFields?: Record<string, unknown>;
}

export interface IAiRunResult {
  runId: string;
  status: AiRunStatus;
  outputText: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

export interface IUsageAggregate {
  total: number;
  byStatus: Record<'ok' | 'failed' | 'rate-limited' | 'skipped', number>;
  promptTokens: number;
  completionTokens: number;
  averageDurationMs: number;
  totalDurationMs: number;
}

export interface ICreateTemplateInput {
  operation: AiFieldOperation;
  language?: string;
  name: string;
  promptTemplate: string;
  description?: string | null;
  createdBy: string;
}


export type BatchGenerationMode = 'fill-empty' | 'entire-column';

export type BatchTaskStatus =
  | 'waiting'
  | 'processing'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface IBatchGenerationInput {
  aiFieldId: string;
  mode: BatchGenerationMode;
  /** Optional view filter; when omitted, all records in the table are processed. */
  viewId?: string;
  createdBy: string;
  /** Optional idempotency key — repeated calls with the same key return the existing task. */
  idempotencyKey?: string;
  /** Optional tenant id, forwarded to the durable worker for audit logs. */
  tenantId?: string;
  /** Optional correlation id, surfaced on the task row and logs. */
  correlationId?: string;
  /** Maximum retry attempts when the worker fails (capped at 5). */
  maxAttempts?: number;
}

export interface IBatchGenerationResult {
  taskId: string;
  status: BatchTaskStatus;
  totalCount: number;
}

export interface IAiGenerationTaskRow {
  id: string;
  spaceId: string | null;
  baseId: string;
  tableId: string;
  trigger: string;
  status: BatchTaskStatus | string;
  totalCount: number;
  completedCount: number;
  failedCount: number;
  cancelRequested: boolean;
  lastError: string | null;
  errorCode: string | null;
  attempt: number;
  maxAttempts: number;
  heartbeatAt: Date | null;
  leaseUntil: Date | null;
  retryAt: Date | null;
  tenantId: string | null;
  correlationId: string | null;
  idempotencyKey: string | null;
  startedTime: Date | null;
  finishedTime: Date | null;
  createdTime: Date;
  updatedTime: Date;
}

export const SUPPORTED_OPERATIONS: ReadonlyArray<AiFieldOperation> = [
  'classify',
  'summarize',
  'translate',
  'score',
  'image',
  'custom',
];
export const SUPPORTED_MODELS: ReadonlyArray<string> = [
  'gpt-4o-mini',
  'gpt-4o',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-5',
  // V26 — custom gateway models (MiniMax, OpenRouter, etc.) routed via aiGatewayBaseUrl
  'MiniMax-M3',
  'MiniMax-Text-01',
];
