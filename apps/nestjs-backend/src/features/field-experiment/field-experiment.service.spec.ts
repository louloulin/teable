import {
  applyExperimentToRead,
  assignVariant,
  bucketize,
  buildExposure,
  deriveExperimentKey,
  findVariant,
  isValidExperimentTransition,
  shouldAutoComplete,
  summarizeExposures,
  validateExperiment,
} from './field-experiment.service';
import type { IExperimentExposure, IFieldExperiment } from './field-experiment.types';

const baseExperiment = (over: Partial<IFieldExperiment> = {}): IFieldExperiment => ({
  id: 'exp1',
  baseId: 'b1',
  tableId: 't1',
  fieldId: 'f1',
  key: 'sum-prompt',
  status: 'running',
  variants: [
    { id: 'v1', label: 'control', kind: 'control', weight: 50 },
    { id: 'v2', label: 'treatment', kind: 'treatment', weight: 50 },
  ],
  salt: 's1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('field-experiment.bucketize', () => {
  it('is deterministic for the same input', () => {
    expect(bucketize('s1', 'r1')).toBe(bucketize('s1', 'r1'));
  });
  it('returns 0..1', () => {
    const b = bucketize('salt', 'rec');
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(1);
  });
  it('changes when the salt changes', () => {
    expect(bucketize('a', 'r1')).not.toBe(bucketize('b', 'r1'));
  });
});

describe('field-experiment.assignVariant', () => {
  it('returns null when experiment is not running', () => {
    expect(assignVariant(baseExperiment({ status: 'paused' }), 'r1')).toBeNull();
  });
  it('returns null when no variant has positive weight', () => {
    expect(
      assignVariant(
        baseExperiment({
          variants: [
            { id: 'v1', label: 'c', kind: 'control', weight: 0 },
            { id: 'v2', label: 't', kind: 'treatment', weight: 0 },
          ],
        }),
        'r1'
      )
    ).toBeNull();
  });
  it('assigns deterministically (sticky by default)', () => {
    const exp = baseExperiment();
    const a1 = assignVariant(exp, 'r1');
    const a2 = assignVariant(exp, 'r1');
    expect(a1).not.toBeNull();
    expect(a2).not.toBeNull();
    expect(a1?.variantId).toBe(a2?.variantId);
  });
  it('respects 100/0 allocation', () => {
    const exp = baseExperiment({
      variants: [
        { id: 'v1', label: 'c', kind: 'control', weight: 100 },
        { id: 'v2', label: 't', kind: 'treatment', weight: 0 },
      ],
    });
    for (let i = 0; i < 50; i++) {
      expect(assignVariant(exp, `r${i}`)?.variantId).toBe('v1');
    }
  });
});

describe('field-experiment.validateExperiment', () => {
  it('passes a healthy experiment', () => {
    expect(validateExperiment(baseExperiment())).toEqual([]);
  });
  it('flags missing fields', () => {
    const errs = validateExperiment({
      ...baseExperiment(),
      id: '',
      baseId: '',
      tableId: '',
      fieldId: '',
      key: '',
    });
    expect(errs.length).toBeGreaterThanOrEqual(5);
  });
  it('flags duplicate variant ids', () => {
    const errs = validateExperiment(
      baseExperiment({
        variants: [
          { id: 'v1', label: 'c', kind: 'control', weight: 1 },
          { id: 'v1', label: 't', kind: 'treatment', weight: 1 },
        ],
      })
    );
    expect(errs.join(' ')).toContain('duplicate variant id');
  });
  it('flags more than one control', () => {
    const errs = validateExperiment(
      baseExperiment({
        variants: [
          { id: 'v1', label: 'c1', kind: 'control', weight: 1 },
          { id: 'v2', label: 'c2', kind: 'control', weight: 1 },
        ],
      })
    );
    expect(errs.join(' ')).toContain('only one control');
  });
  it('flags negative weight', () => {
    const errs = validateExperiment(
      baseExperiment({
        variants: [
          { id: 'v1', label: 'c', kind: 'control', weight: -1 },
          { id: 'v2', label: 't', kind: 'treatment', weight: 1 },
        ],
      })
    );
    expect(errs.join(' ')).toContain('weight');
  });
  it('flags empty variants list', () => {
    const errs = validateExperiment(baseExperiment({ variants: [] }));
    expect(errs.join(' ')).toContain('at least one variant');
  });
});

describe('field-experiment.isValidExperimentTransition', () => {
  it('allows draft → running', () => {
    expect(isValidExperimentTransition('draft', 'running')).toBe(true);
  });
  it('forbids running → draft', () => {
    expect(isValidExperimentTransition('running', 'draft')).toBe(false);
  });
  it('allows running → paused and → completed', () => {
    expect(isValidExperimentTransition('running', 'paused')).toBe(true);
    expect(isValidExperimentTransition('running', 'completed')).toBe(true);
  });
  it('forbids archived → anything', () => {
    expect(isValidExperimentTransition('archived', 'running')).toBe(false);
  });
});

describe('field-experiment.findVariant', () => {
  it('returns the matching variant', () => {
    const v = findVariant(baseExperiment(), 'v2');
    expect(v?.label).toBe('treatment');
  });
  it('returns undefined when missing', () => {
    expect(findVariant(baseExperiment(), 'missing')).toBeUndefined();
  });
});

describe('field-experiment.buildExposure', () => {
  it('builds a basic exposure', () => {
    const e = buildExposure({
      assignment: {
        experimentId: 'exp1',
        recordId: 'r1',
        variantId: 'v1',
        bucket: 0.42,
        assignedAt: '2026-01-01T00:00:00Z',
      },
    });
    expect(e.experimentId).toBe('exp1');
    expect(e.recordId).toBe('r1');
    expect(e.assignmentId).toBe('exp1:r1');
  });
  it('includes outcome and value when provided', () => {
    const e = buildExposure({
      assignment: {
        experimentId: 'exp1',
        recordId: 'r1',
        variantId: 'v1',
        bucket: 0.42,
        assignedAt: '2026-01-01T00:00:00Z',
      },
      outcome: 'click',
      value: 1.5,
    });
    expect(e.outcome).toBe('click');
    expect(e.value).toBe(1.5);
  });
});

describe('field-experiment.summarizeExposures', () => {
  it('reports 0 exposures when input is empty', () => {
    const s = summarizeExposures({ experiment: baseExperiment(), exposures: [] });
    expect(s.variants.every((v) => v.exposures === 0)).toBe(true);
    expect(s.treatmentWins).toBe(false);
    expect(s.recommendedVariantId).toBe('v1');
  });
  it('detects a winning treatment', () => {
    const exp = baseExperiment();
    const exposures: IExperimentExposure[] = [];
    for (let i = 0; i < 100; i++) {
      exposures.push({
        experimentId: 'exp1',
        assignmentId: `r${i}`,
        recordId: `r${i}`,
        variantId: i % 2 === 0 ? 'v1' : 'v2',
        outcome: i % 2 === 0 ? 'exposure' : i < 90 ? 'convert' : 'exposure',
        observedAt: '2026-01-01T00:00:00Z',
      });
    }
    const s = summarizeExposures({ experiment: exp, exposures });
    expect(s.treatmentWins).toBe(true);
    expect(s.recommendedVariantId).toBe('v2');
  });
  it('keeps control as recommended when lift is below threshold', () => {
    const exp = baseExperiment();
    const exposures: IExperimentExposure[] = [];
    for (let i = 0; i < 100; i++) {
      exposures.push({
        experimentId: 'exp1',
        assignmentId: `r${i}`,
        recordId: `r${i}`,
        variantId: i % 2 === 0 ? 'v1' : 'v2',
        outcome: 'exposure',
        observedAt: '2026-01-01T00:00:00Z',
      });
    }
    const s = summarizeExposures({ experiment: exp, exposures });
    expect(s.treatmentWins).toBe(false);
    expect(s.recommendedVariantId).toBe('v1');
  });
});

describe('field-experiment.applyExperimentToRead', () => {
  it('returns the base value when no experiment is provided', () => {
    const r = applyExperimentToRead({ experiment: null, recordId: 'r1', baseValue: 'x' });
    expect(r.value).toBe('x');
    expect(r.exposure).toBeNull();
  });
  it('returns the base value when experiment is paused', () => {
    const r = applyExperimentToRead({
      experiment: baseExperiment({ status: 'paused' }),
      recordId: 'r1',
      baseValue: 'x',
    });
    expect(r.value).toBe('x');
    expect(r.exposure).toBeNull();
  });
  it('annotates the value when the chosen variant is treatment with a payload', () => {
    const exp = baseExperiment({
      variants: [
        { id: 'v1', label: 'control', kind: 'control', weight: 0 },
        {
          id: 'v2',
          label: 'treatment',
          kind: 'treatment',
          weight: 100,
          payload: { prompt: 'alt' },
        },
      ],
    });
    const r = applyExperimentToRead({ experiment: exp, recordId: 'r1', baseValue: 'orig' });
    expect(typeof r.value).toBe('object');
    expect((r.value as { variant: { id: string } }).variant.id).toBe('v2');
    expect(r.exposure).not.toBeNull();
  });
  it('returns the base value when the chosen variant is control', () => {
    const exp = baseExperiment({
      variants: [
        { id: 'v1', label: 'control', kind: 'control', weight: 100 },
        { id: 'v2', label: 'treatment', kind: 'treatment', weight: 0 },
      ],
    });
    const r = applyExperimentToRead({ experiment: exp, recordId: 'r1', baseValue: 'orig' });
    expect(r.value).toBe('orig');
    expect(r.exposure?.variantId).toBe('v1');
  });
});

describe('field-experiment.shouldAutoComplete', () => {
  it('returns true when there is a 2-variant winner', () => {
    expect(
      shouldAutoComplete({
        experimentId: 'e',
        variants: [
          { variantId: 'v1', exposures: 100, conversions: 10, meanValue: 0, conversionRate: 0.1 },
          { variantId: 'v2', exposures: 100, conversions: 20, meanValue: 0, conversionRate: 0.2 },
        ],
        treatmentWins: true,
        recommendedVariantId: 'v2',
      })
    ).toBe(true);
  });
  it('returns false when there is no winner', () => {
    expect(
      shouldAutoComplete({
        experimentId: 'e',
        variants: [
          { variantId: 'v1', exposures: 100, conversions: 10, meanValue: 0, conversionRate: 0.1 },
        ],
        treatmentWins: false,
        recommendedVariantId: 'v1',
      })
    ).toBe(false);
  });
});

describe('field-experiment.deriveExperimentKey', () => {
  it('is deterministic', () => {
    const k1 = deriveExperimentKey({ baseId: 'b', tableId: 't', fieldId: 'f', purpose: 'p' });
    const k2 = deriveExperimentKey({ baseId: 'b', tableId: 't', fieldId: 'f', purpose: 'p' });
    expect(k1).toBe(k2);
  });
  it('changes when the purpose changes', () => {
    const a = deriveExperimentKey({ baseId: 'b', tableId: 't', fieldId: 'f', purpose: 'p' });
    const b = deriveExperimentKey({ baseId: 'b', tableId: 't', fieldId: 'f', purpose: 'q' });
    expect(a).not.toBe(b);
  });
});
