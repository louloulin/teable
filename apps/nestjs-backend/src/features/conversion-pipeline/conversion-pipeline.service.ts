/**
 * Conversion pipeline DSL — pure helpers (Stage 86).
 */

import { coerce as mapCoerce, type IFieldTypeMap } from '../field-type-map/field-type-map.service';
import type { FieldDataKind } from '../field-type-map/field-type-map.types';
import type {
  IPipeline,
  IPipelineFilter,
  IPipelineRun,
  IPipelineStep,
  IStepExecution,
} from './conversion-pipeline.types';
import { MAX_STEPS_PER_PIPELINE } from './conversion-pipeline.types';

/** Validate a pipeline. */
export function validatePipeline(p: IPipeline): string | null {
  if (!p.id) return 'pipelineId required';
  if (!p.name) return 'name required';
  if (!Array.isArray(p.steps)) return 'steps must be an array';
  if (p.steps.length > MAX_STEPS_PER_PIPELINE) return `steps cap ${MAX_STEPS_PER_PIPELINE}`;
  const seen = new Set<string>();
  for (const s of p.steps) {
    if (seen.has(s.id)) return `duplicate step id: ${s.id}`;
    seen.add(s.id);
    const err = validateStep(s);
    if (err) return err;
  }
  return null;
}

/** Validate a single step. */
export function validateStep(s: IPipelineStep): string | null {
  if (!s.id) return 'step.id required';
  if (!s.sourceField) return `step.sourceField required for ${s.id}`;
  if (!s.targetField) return `step.targetField required for ${s.id}`;
  if (s.sourceField === s.targetField) return `step source/target must differ for ${s.id}`;
  return null;
}

/** Evaluate a filter predicate against a record. */
export function matchesFilter(filter: IPipelineFilter, record: Record<string, unknown>): boolean {
  const v = record[filter.field];
  switch (filter.op) {
    case 'eq':
      return v === filter.value;
    case 'ne':
      return v !== filter.value;
    case 'in':
      return Array.isArray(filter.value) && (filter.value as unknown[]).includes(v);
    case 'contains':
      return typeof v === 'string' && typeof filter.value === 'string' && v.includes(filter.value);
    default:
      return false;
  }
}

/** Run a single step against one record (mutates a copy of the record). */
export function runStep(input: {
  step: IPipelineStep;
  record: Record<string, unknown>;
  maps: ReadonlyArray<IFieldTypeMap>;
  fromKind: FieldDataKind;
  toKind: FieldDataKind;
}): { record: Record<string, unknown>; execution: IStepExecution } {
  const before = input.record[input.step.sourceField];
  const exec: IStepExecution = {
    stepId: input.step.id,
    ok: true,
    valueBefore: before,
    valueAfter: before,
  };
  const next = { ...input.record };
  if (input.step.when && !matchesFilter(input.step.when, input.record)) {
    return { record: next, execution: exec };
  }
  const res = mapCoerce({
    maps: input.maps,
    from: input.fromKind,
    to: input.toKind,
    value: before,
  });
  exec.valueAfter = res.value;
  exec.ok = res.ok;
  if (!res.ok) exec.error = 'coercion failed';
  next[input.step.targetField] = res.value;
  return { record: next, execution: exec };
}

/** Run an entire pipeline against a list of records. */
export function runPipeline(input: {
  pipeline: IPipeline;
  records: ReadonlyArray<Record<string, unknown>>;
  maps: ReadonlyArray<IFieldTypeMap>;
  fieldKinds: Record<string, { from: FieldDataKind; to: FieldDataKind }>;
  now: string;
}): { records: Record<string, unknown>[]; run: IPipelineRun; executions: IStepExecution[] } {
  const err = validatePipeline(input.pipeline);
  if (err) throw new Error(`invalid pipeline: ${err}`);
  const out: Record<string, unknown>[] = [];
  const executions: IStepExecution[] = [];
  let failures = 0;
  for (const record of input.records) {
    let cur = { ...record };
    for (const step of input.pipeline.steps) {
      const kinds = input.fieldKinds[step.id] ?? { from: 'string', to: 'string' };
      const { record: next, execution } = runStep({
        step,
        record: cur,
        maps: input.maps,
        fromKind: kinds.from,
        toKind: kinds.to,
      });
      cur = next;
      executions.push(execution);
      if (!execution.ok) failures++;
    }
    out.push(cur);
  }
  const run: IPipelineRun = {
    pipelineId: input.pipeline.id,
    recordCount: input.records.length,
    stepCount: input.pipeline.steps.length,
    ok: failures === 0,
    startedAt: input.now,
    finishedAt: input.now,
    failures,
  };
  return { records: out, run, executions };
}

/** Append a pipeline, capped per-org. */
export function appendPipeline(input: {
  pipelines: ReadonlyArray<IPipeline>;
  pipeline: IPipeline;
}): IPipeline[] {
  return [...input.pipelines, input.pipeline].slice(-256);
}

/** Reorder steps by id list. Throws when an id is missing. */
export function reorderSteps(input: {
  steps: ReadonlyArray<IPipelineStep>;
  order: ReadonlyArray<string>;
}): IPipelineStep[] {
  const byId = new Map(input.steps.map((s) => [s.id, s]));
  const out: IPipelineStep[] = [];
  for (const id of input.order) {
    const s = byId.get(id);
    if (!s) throw new Error(`unknown step id: ${id}`);
    out.push(s);
  }
  return out;
}
