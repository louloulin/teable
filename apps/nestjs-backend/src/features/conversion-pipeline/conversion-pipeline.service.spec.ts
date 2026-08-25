/**
 * Conversion pipeline DSL — pure helpers spec (Stage 86).
 */

import { defaultMatrix } from '../field-type-map/field-type-map.service';
import {
  appendPipeline,
  matchesFilter,
  reorderSteps,
  runPipeline,
  runStep,
  validatePipeline,
  validateStep,
} from './conversion-pipeline.service';
import type { IPipeline, IPipelineStep } from './conversion-pipeline.types';

const basePipeline = (over: Partial<IPipeline> = {}): IPipeline => ({
  id: 'p1',
  name: 'main',
  steps: [
    {
      id: 's1',
      sourceField: 'amount',
      targetField: 'amount_cents',
      conversion: 'cast',
    },
  ],
  ...over,
});

describe('conversion-pipeline.validateStep', () => {
  it('passes', () => {
    expect(
      validateStep({
        id: 's1',
        sourceField: 'a',
        targetField: 'b',
        conversion: 'cast',
      })
    ).toBeNull();
  });
  it('rejects same source/target', () => {
    expect(
      validateStep({ id: 's1', sourceField: 'a', targetField: 'a', conversion: 'cast' })
    ).toContain('differ');
  });
});

describe('conversion-pipeline.validatePipeline', () => {
  it('passes', () => {
    expect(validatePipeline(basePipeline())).toBeNull();
  });
  it('rejects duplicate ids', () => {
    expect(
      validatePipeline(
        basePipeline({
          steps: [
            { id: 's1', sourceField: 'a', targetField: 'b', conversion: 'cast' },
            { id: 's1', sourceField: 'c', targetField: 'd', conversion: 'cast' },
          ],
        })
      )
    ).toContain('duplicate');
  });
});

describe('conversion-pipeline.matchesFilter', () => {
  it('eq', () => {
    expect(matchesFilter({ field: 'x', op: 'eq', value: 1 }, { x: 1 })).toBe(true);
    expect(matchesFilter({ field: 'x', op: 'eq', value: 1 }, { x: 2 })).toBe(false);
  });
  it('in', () => {
    expect(matchesFilter({ field: 'x', op: 'in', value: [1, 2] }, { x: 2 })).toBe(true);
    expect(matchesFilter({ field: 'x', op: 'in', value: [1, 2] }, { x: 3 })).toBe(false);
  });
  it('contains', () => {
    expect(matchesFilter({ field: 'x', op: 'contains', value: 'foo' }, { x: 'foobar' })).toBe(true);
  });
  it('ne', () => {
    expect(matchesFilter({ field: 'x', op: 'ne', value: 1 }, { x: 2 })).toBe(true);
  });
});

describe('conversion-pipeline.runStep', () => {
  it('casts', () => {
    const maps = [
      {
        source: 'string' as const,
        target: 'number' as const,
        conversion: 'cast' as const,
        lossless: false,
      },
    ];
    const { record, execution } = runStep({
      step: {
        id: 's1',
        sourceField: 'a',
        targetField: 'b',
        conversion: 'cast',
      },
      record: { a: '42' },
      maps,
      fromKind: 'string',
      toKind: 'number',
    });
    expect(execution.ok).toBe(true);
    expect(record['b']).toBe(42);
  });
  it('respects when filter', () => {
    const maps = [
      {
        source: 'string' as const,
        target: 'number' as const,
        conversion: 'cast' as const,
        lossless: false,
      },
    ];
    const { record, execution } = runStep({
      step: {
        id: 's1',
        sourceField: 'a',
        targetField: 'b',
        conversion: 'cast',
        when: { field: 'active', op: 'eq', value: true },
      },
      record: { a: '42', active: false },
      maps,
      fromKind: 'string',
      toKind: 'number',
    });
    expect(execution.valueAfter).toBe('42');
    expect(record['b']).toBeUndefined();
  });
});

describe('conversion-pipeline.runPipeline', () => {
  it('runs', () => {
    const maps = [
      {
        source: 'string' as const,
        target: 'number' as const,
        conversion: 'cast' as const,
        lossless: false,
      },
    ];
    const { records, run } = runPipeline({
      pipeline: basePipeline(),
      records: [{ amount: '10' }, { amount: '20' }],
      maps,
      fieldKinds: { s1: { from: 'string', to: 'number' } },
      now: '2026-01-01T00:00:00Z',
    });
    expect(records.length).toBe(2);
    expect(records[0]!['amount_cents']).toBe(10);
    expect(run.ok).toBe(true);
    expect(run.failures).toBe(0);
  });
  it('records failures', () => {
    const maps = defaultMatrix();
    const { run } = runPipeline({
      pipeline: basePipeline(),
      records: [{ amount: 'abc' }],
      maps,
      fieldKinds: { s1: { from: 'string', to: 'number' } },
      now: '2026-01-01T00:00:00Z',
    });
    expect(run.ok).toBe(false);
    expect(run.failures).toBe(1);
  });
});

describe('conversion-pipeline.appendPipeline', () => {
  it('adds', () => {
    const out = appendPipeline({ pipelines: [], pipeline: basePipeline() });
    expect(out.length).toBe(1);
  });
});

describe('conversion-pipeline.reorderSteps', () => {
  it('reorders', () => {
    const steps: IPipelineStep[] = [
      { id: 'a', sourceField: 'x', targetField: 'y', conversion: 'cast' },
      { id: 'b', sourceField: 'y', targetField: 'z', conversion: 'cast' },
    ];
    const out = reorderSteps({ steps, order: ['b', 'a'] });
    expect(out[0]!.id).toBe('b');
  });
  it('throws on missing id', () => {
    expect(() => reorderSteps({ steps: [], order: ['unknown'] })).toThrow(/unknown step id/);
  });
});
