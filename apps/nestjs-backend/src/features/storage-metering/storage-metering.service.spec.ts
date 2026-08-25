/**
 * Per-base storage metering — pure helpers spec (Stage 81).
 */

import {
  appendSample,
  attributionFromLatest,
  attributeSamples,
  billableCents,
  billableLine,
  bytesToGb,
  emptyByKind,
  isStorageKind,
  latestPerKind,
  normalizeAttribution,
  sumBillable,
  validateSample,
} from './storage-metering.service';
import type { IStorageSample } from './storage-metering.types';
import { STORAGE_BYTES_PER_GB } from './storage-metering.types';

const baseSample = (over: Partial<IStorageSample> = {}): IStorageSample => ({
  id: 's1',
  orgId: 'o1',
  baseId: 'b1',
  kind: 'records',
  bytes: 1024,
  endedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('storage-metering.isStorageKind', () => {
  it('accepts', () => {
    expect(isStorageKind('records')).toBe(true);
    expect(isStorageKind('attachments')).toBe(true);
  });
  it('rejects', () => {
    expect(isStorageKind('??')).toBe(false);
  });
});

describe('storage-metering.validateSample', () => {
  it('passes', () => {
    expect(validateSample(baseSample())).toBeNull();
  });
  it('rejects missing baseId', () => {
    expect(validateSample(baseSample({ baseId: '' }))).toBe('baseId required');
  });
  it('rejects unknown kind', () => {
    expect(validateSample(baseSample({ kind: '??' as never }))).toContain('kind');
  });
  it('rejects negative bytes', () => {
    expect(validateSample(baseSample({ bytes: -1 }))).toContain('bytes');
  });
});

describe('storage-metering.emptyByKind', () => {
  it('zeroes all kinds', () => {
    const b = emptyByKind();
    expect(Object.keys(b).length).toBeGreaterThanOrEqual(5);
    for (const v of Object.values(b)) expect(v).toBe(0);
  });
});

describe('storage-metering.attributeSamples', () => {
  it('sums by kind', () => {
    const out = attributeSamples({
      orgId: 'o1',
      baseId: 'b1',
      samples: [
        baseSample({ bytes: 100 }),
        baseSample({ id: 's2', kind: 'attachments', bytes: 200 }),
      ],
    });
    expect(out.byKind['records']).toBe(100);
    expect(out.byKind['attachments']).toBe(200);
    expect(out.totalBytes).toBe(300);
  });
});

describe('storage-metering.normalizeAttribution', () => {
  it('fills missing', () => {
    const out = normalizeAttribution({
      baseId: 'b1',
      orgId: 'o1',
      totalBytes: 100,
      byKind: { records: 100, attachments: 0, snapshots: 0, history: 0, other: 0 },
    });
    expect(out.byKind['records']).toBe(100);
  });
});

describe('storage-metering.bytesToGb', () => {
  it('divides', () => {
    expect(bytesToGb(STORAGE_BYTES_PER_GB)).toBe(1);
  });
});

describe('storage-metering.billableCents', () => {
  it('rounds up to next GB', () => {
    expect(billableCents({ bytes: STORAGE_BYTES_PER_GB + 1 })).toBe(5);
  });
  it('1 GB exact', () => {
    expect(billableCents({ bytes: STORAGE_BYTES_PER_GB })).toBe(4);
  });
});

describe('storage-metering.billableLine', () => {
  it('builds', () => {
    const line = billableLine({
      baseId: 'b1',
      orgId: 'o1',
      totalBytes: STORAGE_BYTES_PER_GB,
      byKind: emptyByKind(),
    });
    expect(line.cents).toBe(4);
  });
});

describe('storage-metering.sumBillable', () => {
  it('sums', () => {
    const out = sumBillable([
      { baseId: 'b1', orgId: 'o1', bytes: 100, cents: 200 },
      { baseId: 'b2', orgId: 'o1', bytes: 300, cents: 400 },
    ]);
    expect(out.cents).toBe(600);
    expect(out.bytes).toBe(400);
  });
});

describe('storage-metering.appendSample', () => {
  it('appends', () => {
    expect(appendSample({ samples: [], sample: baseSample() }).length).toBe(1);
  });
  it('trims', () => {
    const samples = Array.from({ length: 5 }, (_, i) =>
      baseSample({ id: `s${i}`, endedAt: `2026-01-0${i + 1}T00:00:00Z` })
    );
    const out = appendSample({
      samples,
      sample: baseSample({ id: 'sx' }),
      cap: 3,
    });
    expect(out.length).toBe(3);
  });
});

describe('storage-metering.latestPerKind', () => {
  it('picks latest', () => {
    const out = latestPerKind([
      baseSample({ endedAt: '2026-01-01T00:00:00Z' }),
      baseSample({ id: 's2', endedAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(out[0]!.endedAt).toBe('2026-01-02T00:00:00Z');
  });
});

describe('storage-metering.attributionFromLatest', () => {
  it('aggregates latest', () => {
    const out = attributionFromLatest({
      orgId: 'o1',
      baseId: 'b1',
      samples: [
        baseSample({ endedAt: '2026-01-01T00:00:00Z', bytes: 100 }),
        baseSample({ id: 's2', endedAt: '2026-01-02T00:00:00Z', bytes: 200 }),
      ],
    });
    expect(out.totalBytes).toBe(200);
  });
});
