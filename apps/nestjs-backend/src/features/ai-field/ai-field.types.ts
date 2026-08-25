/**
 * AI field (autoClassify/Summarize/Translate) — Stage 31 types.
 *
 * Per-field AI configuration with model, prompt template,
 * operation-specific config (labels/target language/max length),
 * per-run token usage audit, and shared template library.
 */

export type AiFieldOperation = 'classify' | 'summarize' | 'translate';

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

export type AiFieldConfig = IClassifyConfig | ISummarizeConfig | ITranslateConfig;

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
}

export interface IAiRunResult {
  runId: string;
  status: AiRunStatus;
  outputText: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

export interface ICreateTemplateInput {
  operation: AiFieldOperation;
  language?: string;
  name: string;
  promptTemplate: string;
  description?: string | null;
  createdBy: string;
}

export const SUPPORTED_OPERATIONS: ReadonlyArray<AiFieldOperation> = [
  'classify',
  'summarize',
  'translate',
];
export const SUPPORTED_MODELS: ReadonlyArray<string> = [
  'gpt-4o-mini',
  'gpt-4o',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-5',
];
