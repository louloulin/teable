/**
 * AI field — Stage 31.
 *
 * Pure helpers: config validation + canonical hashing, prompt
 * rendering, operation-specific output guards, and usage
 * aggregation.
 */

import { createHash } from 'node:crypto';

import type {
  AiFieldConfig,
  AiFieldOperation,
  AiFieldStatus,
  IClassifyConfig,
  ICustomPromptConfig,
  ICreateAiFieldInput,
  ICreateTemplateInput,
  IImageConfig,
  IRunAiFieldInput,
  IScoreConfig,
  ISummarizeConfig,
  ITranslateConfig,
  IUsageAggregate,
} from './ai-field.types';
import { SUPPORTED_MODELS, SUPPORTED_OPERATIONS } from './ai-field.types';

export function isValidOperation(op: string): op is AiFieldOperation {
  return (SUPPORTED_OPERATIONS as ReadonlyArray<string>).includes(op);
}

export function isValidModel(model: string): boolean {
  return (SUPPORTED_MODELS as ReadonlyArray<string>).includes(model);
}

export function isValidStatusTransition(from: AiFieldStatus, to: AiFieldStatus): boolean {
  const allow: Record<AiFieldStatus, ReadonlyArray<AiFieldStatus>> = {
    enabled: ['paused', 'error'],
    paused: ['enabled', 'error'],
    error: ['enabled', 'paused'],
  };
  return allow[from]?.includes(to) ?? false;
}

export function validateConfig(op: AiFieldOperation, config: AiFieldConfig): void {
  if (op === 'classify') {
    const c = config as IClassifyConfig;
    if (!Array.isArray(c.labels) || c.labels.length === 0)
      throw new Error('classify.labels required');
    if (c.labels.some((l) => typeof l !== 'string' || l.trim().length === 0)) {
      throw new Error('classify.labels must be non-empty strings');
    }
    if (new Set(c.labels).size !== c.labels.length)
      throw new Error('classify.labels must be unique');
  } else if (op === 'summarize') {
    const c = config as ISummarizeConfig;
    if (c.maxLength !== undefined && (c.maxLength <= 0 || c.maxLength > 4096)) {
      throw new Error('summarize.maxLength out of range');
    }
    if (c.style !== undefined && !['concise', 'detailed', 'bullets'].includes(c.style)) {
      throw new Error('summarize.style invalid');
    }
  } else if (op === 'translate') {
    const c = config as ITranslateConfig;
    if (typeof c.targetLang !== 'string' || c.targetLang.trim().length === 0) {
      throw new Error('translate.targetLang required');
    }
  } else if (op === 'score') {
    const c = config as IScoreConfig;
    if (!Number.isInteger(c.min) || !Number.isInteger(c.max)) {
      throw new Error('score.min/max must be integers');
    }
    if (c.min < 0 || c.max > 10_000 || c.min >= c.max) {
      throw new Error('score range invalid: 0 <= min < max <= 10000');
    }
    if (c.criteria !== undefined && typeof c.criteria !== 'string') {
      throw new Error('score.criteria must be a string');
    }
    if (c.description !== undefined && typeof c.description !== 'string') {
      throw new Error('score.description must be a string');
    }
  } else if (op === 'image') {
    const c = config as IImageConfig;
    if (typeof c.prompt !== 'string' || c.prompt.trim().length === 0) {
      throw new Error('image.prompt required');
    }
    if (c.size !== undefined && typeof c.size !== 'string') {
      throw new Error('image.size must be a string');
    }
    if (c.count !== undefined && (!Number.isInteger(c.count) || c.count < 1 || c.count > 4)) {
      throw new Error('image.count must be an integer in [1,4]');
    }
    if (c.aspectRatio !== undefined && typeof c.aspectRatio !== 'string') {
      throw new Error('image.aspectRatio must be a string');
    }
    if (c.quality !== undefined && !['standard', 'hd'].includes(c.quality)) {
      throw new Error('image.quality must be standard or hd');
    }
  } else if (op === 'custom') {
    const c = config as ICustomPromptConfig;
    if (typeof c.prompt !== 'string' || c.prompt.trim().length === 0) {
      throw new Error('custom.prompt required');
    }
    if (c.systemPrompt !== undefined && typeof c.systemPrompt !== 'string') {
      throw new Error('custom.systemPrompt must be a string');
    }
    if (c.language !== undefined && !['english', 'chinese'].includes(c.language)) {
      throw new Error('custom.language must be english or chinese');
    }
  }
}

export function stringifyConfig(config: AiFieldConfig): string {
  // Deterministic: stringify sorted keys.
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(config).sort())
    sorted[key] = (config as Record<string, unknown>)[key];
  if ('labels' in sorted && Array.isArray(sorted.labels)) {
    sorted.labels = (sorted.labels as string[]).slice().sort();
  }
  return JSON.stringify(sorted);
}

export function hashConfig(config: AiFieldConfig): string {
  return createHash('sha256').update(stringifyConfig(config)).digest('hex');
}

/** Estimate token count using ~4 chars/token (English-leaning heuristic). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function renderPrompt(input: {
  template: string;
  variables: Record<string, string | number>;
}): string {
  return input.template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
    const v = input.variables[name];
    return v === undefined || v === null ? '' : String(v);
  });
}

export const DEFAULT_TEMPLATES: Record<AiFieldOperation, Record<string, string>> = {
  classify: {
    english:
      'Classify the following text into one of: {{labels}}. Return only the label.\n\nText: {{input}}',
    chinese: '将下面的文本分类到下列之一：{{labels}}。仅返回标签。\n\n文本：{{input}}',
  },
  summarize: {
    english:
      'Summarize the following text in {{maxLength}} words or fewer ({{style}} style).\n\nText: {{input}}',
    chinese: '用不超过 {{maxLength}} 字总结以下文本（{{style}} 风格）。\n\n文本：{{input}}',
  },
  translate: {
    english: 'Translate the following text into {{targetLang}}.\n\nText: {{input}}',
    chinese: '将下面的文本翻译成 {{targetLang}}。\n\n文本：{{input}}',
  },
  score: {
    english:
      'Rate the following text on a scale of {{min}} to {{max}}. {{criteria}} Return only the numeric score.\n\nText: {{input}}',
    chinese:
      '请根据 {{min}} 到 {{max}} 的评分标准为以下文本评分。{{criteria}} 仅返回数字分数。\n\n文本：{{input}}',
  },
  image: {
    english: '{{prompt}}\n\nSource context:\n{{input}}',
    chinese: '{{prompt}}\n\n参考上下文：\n{{input}}',
  },
  custom: {
    english: '{{prompt}}',
    chinese: '{{prompt}}',
  },
};

export function buildDefaultPrompt(
  op: AiFieldOperation,
  language: string,
  config: AiFieldConfig,
  input: string
): string {
  const tmpl = DEFAULT_TEMPLATES[op][language] ?? DEFAULT_TEMPLATES[op].english;
  if (op === 'classify') {
    const c = config as IClassifyConfig;
    return renderPrompt({ template: tmpl, variables: { labels: c.labels.join(', '), input } });
  }
  if (op === 'summarize') {
    const c = config as ISummarizeConfig;
    return renderPrompt({
      template: tmpl,
      variables: { maxLength: c.maxLength ?? 100, style: c.style ?? 'concise', input },
    });
  }
  if (op === 'score') {
    const c = config as IScoreConfig;
    return renderPrompt({
      template: tmpl,
      variables: {
        min: c.min,
        max: c.max,
        criteria: c.criteria ? `${c.criteria}\n` : '',
        input,
      },
    });
  }
  if (op === 'image') {
    const c = config as IImageConfig;
    return renderPrompt({
      template: tmpl,
      variables: { prompt: c.prompt, input },
    });
  }
  if (op === 'custom') {
    const c = config as ICustomPromptConfig;
    // For custom ops the user-provided prompt is authoritative: pass it
    // straight through. Field placeholder resolution happens in the auth
    // service which has access to the row's fields.
    return c.prompt;
  }
  const c = config as ITranslateConfig;
  return renderPrompt({ template: tmpl, variables: { targetLang: c.targetLang, input } });
}

export function buildAiFieldRow(input: ICreateAiFieldInput & { id: string }): {
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
} {
  validateConfig(input.operation, input.config);
  return {
    id: input.id,
    baseId: input.baseId,
    tableId: input.tableId,
    fieldId: input.fieldId,
    operation: input.operation,
    model: input.model,
    sourceFieldIds: input.sourceFieldIds.join(','),
    configJson: stringifyConfig(input.config),
    configHash: hashConfig(input.config),
    status: 'enabled',
    lastRunAt: null,
    lastErrorMessage: null,
    createdBy: input.createdBy,
    createdTime: new Date(),
    updatedTime: new Date(),
  };
}

/** Clamp/normalize a model output against operation-specific guardrails. */
export function guardOutput(input: {
  operation: AiFieldOperation;
  config: AiFieldConfig;
  rawOutput: string;
}): string {
  const trimmed = input.rawOutput.trim();
  if (input.operation === 'classify') {
    const labels = (input.config as IClassifyConfig).labels.map((l) => l.toLowerCase());
    const lower = trimmed.toLowerCase();
    const hit = labels.find((l) => lower === l || lower.includes(l));
    return hit ?? labels[0] ?? trimmed;
  }
  if (input.operation === 'summarize') {
    const maxLength = (input.config as ISummarizeConfig).maxLength ?? 100;
    if (trimmed.length <= maxLength) return trimmed;
    return trimmed.slice(0, maxLength - 1).trimEnd() + '…';
  }
  if (input.operation === 'score') {
    const c = input.config as IScoreConfig;
    const match = trimmed.match(/-?\d+(?:\.\d+)?/);
    if (!match) return String(c.min);
    const raw = Number(match[0]);
    if (!Number.isFinite(raw)) return String(c.min);
    const clamped = Math.min(Math.max(raw, c.min), c.max);
    return String(Math.round(clamped));
  }
  // translate / image / custom: no guard besides trim
  return trimmed;
}

export function foldRuns(
  records: ReadonlyArray<{
    status: 'ok' | 'failed' | 'rate-limited' | 'skipped';
    promptTokens: number;
    completionTokens: number;
    durationMs: number;
  }>
): IUsageAggregate {
  const byStatus: IUsageAggregate['byStatus'] = { ok: 0, failed: 0, 'rate-limited': 0, skipped: 0 };
  let prompt = 0;
  let completion = 0;
  let total = 0;
  for (const r of records) {
    byStatus[r.status] += 1;
    prompt += r.promptTokens;
    completion += r.completionTokens;
    total += r.durationMs;
  }
  return {
    total: records.length,
    byStatus,
    promptTokens: prompt,
    completionTokens: completion,
    averageDurationMs: records.length === 0 ? 0 : Math.round(total / records.length),
    totalDurationMs: total,
  };
}

export function buildRunRow(
  input: IRunAiFieldInput & {
    id: string;
    model: string;
    outputText: string;
    status?: 'ok' | 'failed' | 'rate-limited' | 'skipped';
    promptTokens?: number;
    completionTokens?: number;
    errorMessage?: string | null;
    startedAt: Date;
    finishedAt: Date;
  }
): {
  id: string;
  aiFieldId: string;
  recordId: string;
  status: 'ok' | 'failed' | 'rate-limited' | 'skipped';
  inputText: string;
  outputText: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  durationMs: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date;
} {
  return {
    id: input.id,
    aiFieldId: input.aiFieldId,
    recordId: input.recordId,
    status: input.status ?? 'ok',
    inputText: input.inputText,
    outputText: input.outputText,
    promptTokens: input.promptTokens ?? estimateTokens(input.inputText),
    completionTokens: input.completionTokens ?? estimateTokens(input.outputText),
    model: input.model,
    durationMs: input.finishedAt.getTime() - input.startedAt.getTime(),
    errorMessage: input.errorMessage ?? null,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  };
}

export function parseSourceFieldIds(csv: string): string[] {
  return csv
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function parseConfig<TConfig = AiFieldConfig>(configJson: string): TConfig {
  return JSON.parse(configJson) as TConfig;
}

export function buildTemplateRow(input: ICreateTemplateInput & { id: string }): {
  id: string;
  operation: AiFieldOperation;
  language: string;
  name: string;
  promptTemplate: string;
  description: string | null;
  createdBy: string;
  createdTime: Date;
  updatedTime: Date;
} {
  return {
    id: input.id,
    operation: input.operation,
    language: input.language ?? 'english',
    name: input.name,
    promptTemplate: input.promptTemplate,
    description: input.description ?? null,
    createdBy: input.createdBy,
    createdTime: new Date(),
    updatedTime: new Date(),
  };
}
