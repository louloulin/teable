/**
 * Field type mapping matrix — pure helpers spec (Stage 85).
 */

import {
  coerce,
  defaultMatrix,
  isFieldDataKind,
  isLossy,
  lookupMap,
  setMap,
  validateMap,
} from './field-type-map.service';
import { FIELD_DATA_KINDS } from './field-type-map.types';

describe('field-type-map.isFieldDataKind', () => {
  it('accepts', () => {
    expect(isFieldDataKind('string')).toBe(true);
    expect(isFieldDataKind('json')).toBe(true);
  });
  it('rejects', () => {
    expect(isFieldDataKind('??')).toBe(false);
  });
});

describe('field-type-map.defaultMatrix', () => {
  it('has identity direct', () => {
    const m = defaultMatrix();
    const self = m.find((x) => x.source === 'string' && x.target === 'string')!;
    expect(self.conversion).toBe('direct');
    expect(self.lossless).toBe(true);
  });
  it('rejects others', () => {
    const m = defaultMatrix();
    const cross = m.find((x) => x.source === 'string' && x.target === 'number')!;
    expect(cross.conversion).toBe('reject');
    expect(cross.lossless).toBe(false);
  });
  it('covers all pairs', () => {
    expect(defaultMatrix().length).toBe(FIELD_DATA_KINDS.length * FIELD_DATA_KINDS.length);
  });
});

describe('field-type-map.lookupMap', () => {
  it('finds', () => {
    const m = lookupMap(defaultMatrix(), 'string', 'number');
    expect(m).not.toBeNull();
    expect(m!.conversion).toBe('reject');
  });
  it('returns null when missing', () => {
    expect(lookupMap([], 'string', 'number')).toBeNull();
  });
});

describe('field-type-map.isLossy', () => {
  it('true for reject', () => {
    expect(isLossy(defaultMatrix(), 'json', 'number')).toBe(true);
  });
  it('false for identity', () => {
    expect(isLossy(defaultMatrix(), 'string', 'string')).toBe(false);
  });
});

describe('field-type-map.validateMap', () => {
  it('passes', () => {
    expect(
      validateMap({ source: 'string', target: 'number', conversion: 'cast', lossless: false })
    ).toBeNull();
  });
  it('rejects identity non-direct', () => {
    expect(
      validateMap({ source: 'string', target: 'string', conversion: 'cast', lossless: false })
    ).toContain('identity');
  });
  it('rejects reject with lossless', () => {
    expect(
      validateMap({ source: 'string', target: 'number', conversion: 'reject', lossless: true })
    ).toContain('lossless');
  });
});

describe('field-type-map.coerce', () => {
  it('direct pass-through', () => {
    const out = coerce({ maps: defaultMatrix(), from: 'string', to: 'string', value: 'a' });
    expect(out).toEqual({ value: 'a', ok: true });
  });
  it('cast string→number', () => {
    const maps = [
      {
        source: 'string' as const,
        target: 'number' as const,
        conversion: 'cast' as const,
        lossless: false,
      },
    ];
    const out = coerce({ maps, from: 'string', to: 'number', value: '42' });
    expect(out.value).toBe(42);
    expect(out.ok).toBe(true);
  });
  it('cast number→integer', () => {
    const out = coerce({
      maps: [
        {
          source: 'number',
          target: 'integer',
          conversion: 'cast',
          lossless: false,
        },
      ],
      from: 'number',
      to: 'integer',
      value: 3.7,
    });
    expect(out.value).toBe(3);
  });
  it('parse string→date', () => {
    const maps = [
      {
        source: 'string' as const,
        target: 'date' as const,
        conversion: 'parse' as const,
        lossless: false,
      },
    ];
    const out = coerce({ maps, from: 'string', to: 'date', value: '2026-01-15T00:00:00Z' });
    expect(out.ok).toBe(true);
    expect(out.value).toBe('2026-01-15');
  });
  it('parse invalid fails', () => {
    const maps = [
      {
        source: 'string' as const,
        target: 'date' as const,
        conversion: 'parse' as const,
        lossless: false,
      },
    ];
    const out = coerce({ maps, from: 'string', to: 'date', value: 'not-a-date' });
    expect(out.ok).toBe(false);
  });
  it('serialize json→string', () => {
    const maps = [
      {
        source: 'json' as const,
        target: 'string' as const,
        conversion: 'serialize' as const,
        lossless: false,
      },
    ];
    const out = coerce({ maps, from: 'json', to: 'string', value: { a: 1 } });
    expect(out.ok).toBe(true);
    expect(out.value).toBe('{"a":1}');
  });
  it('reject fails', () => {
    const out = coerce({ maps: defaultMatrix(), from: 'string', to: 'number', value: 'a' });
    expect(out.ok).toBe(false);
  });
});

describe('field-type-map.setMap', () => {
  it('adds', () => {
    const out = setMap({
      maps: defaultMatrix(),
      entry: { source: 'string', target: 'number', conversion: 'cast', lossless: false },
    });
    expect(
      out.some((m) => m.source === 'string' && m.target === 'number' && m.conversion === 'cast')
    ).toBe(true);
  });
});
