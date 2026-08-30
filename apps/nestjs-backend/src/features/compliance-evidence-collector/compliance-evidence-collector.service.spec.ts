/**
 * Compliance Evidence Collector — pure helpers spec (Stage 123).
 */

import {
  buildEvidenceId,
  collectEvidence,
  dropStale,
  filterRecords,
  groupByControl,
  hashContent,
  isEvidenceIdValid,
  isFresh,
  presentEvidence,
  totals,
} from './compliance-evidence-collector.service';
import { EvidenceRecord } from './compliance-evidence-collector.types';

function rec(over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 'evi_aaaa0001',
    controlId: 'SOC2-CC6.1',
    kind: 'query_log',
    collectedAt: '2026-08-01T00:00:00Z',
    coversFrom: '2026-05-01T00:00:00Z',
    coversTo: '2026-08-01T00:00:00Z',
    source: 'db',
    contentHash: 'a'.repeat(64),
    sizeBytes: 100,
    ...over,
  };
}

describe('compliance-evidence-collector.buildEvidenceId', () => {
  it('matches regex', () => {
    expect(buildEvidenceId('SOC2-CC6.1', 'query_log', 'abc')).toMatch(/^evi_/);
  });
  it('stable', () => {
    expect(buildEvidenceId('a', 'b', 'c')).toBe(buildEvidenceId('a', 'b', 'c'));
  });
});

describe('compliance-evidence-collector.hashContent', () => {
  it('stable', () => {
    expect(hashContent('hello')).toBe(hashContent('hello'));
  });
  it('64 hex', () => {
    expect(hashContent('x').length).toBe(64);
  });
});

describe('compliance-evidence-collector.isEvidenceIdValid', () => {
  it('valid', () => expect(isEvidenceIdValid('evi_abcdef12')).toBe(true));
  it('invalid', () => expect(isEvidenceIdValid('bad')).toBe(false));
});

describe('compliance-evidence-collector.collectEvidence', () => {
  it('basic', () => {
    const r = collectEvidence({
      candidates: [{ controlId: 'SOC2-CC6.1', kind: 'query_log', content: 'log content', source: 'db' }],
      now: '2026-08-25T00:00:00Z',
    });
    expect(r.records.length).toBe(1);
  });
  it('dedupe', () => {
    const r = collectEvidence({
      candidates: [
        { controlId: 'SOC2-CC6.1', kind: 'query_log', content: 'same', source: 'a' },
        { controlId: 'SOC2-CC6.1', kind: 'query_log', content: 'same', source: 'b' },
      ],
      now: '2026-08-25T00:00:00Z',
    });
    expect(r.records.length).toBe(1);
    expect(r.deduped).toBe(1);
  });
  it('window', () => {
    const r = collectEvidence({
      candidates: [{ controlId: 'SOC2-CC6.1', kind: 'query_log', content: 'x', source: 'a', collectedAt: '2020-01-01T00:00:00Z' }],
      options: { windowDays: 90 },
      now: '2026-08-25T00:00:00Z',
    });
    expect(r.records.length).toBe(0);
  });
  it('max per control', () => {
    const r = collectEvidence({
      candidates: Array.from({ length: 5 }, (_, i) => ({ controlId: 'SOC2-CC6.1', kind: 'query_log' as const, content: `c${i}`, source: 'a' })),
      options: { windowDays: 90, maxPerControl: 2 },
      now: '2026-08-25T00:00:00Z',
    });
    expect(r.records.length).toBe(2);
  });
});

describe('compliance-evidence-collector.filterRecords', () => {
  it('by control', () => {
    expect(filterRecords([rec({ controlId: 'SOC2-CC6.1' }), rec({ controlId: 'SOC2-CC7.1' })], { controlId: 'SOC2-CC6.1' }).length).toBe(1);
  });
  it('by kind', () => {
    expect(filterRecords([rec({ kind: 'query_log' }), rec({ kind: 'change_log' })], { kind: 'change_log' }).length).toBe(1);
  });
  it('by from/to', () => {
    expect(filterRecords([rec({ collectedAt: '2026-08-01' })], { from: '2026-09-01' }).length).toBe(0);
  });
});

describe('compliance-evidence-collector.groupByControl', () => {
  it('groups', () => {
    const g = groupByControl([rec({ controlId: 'a' }), rec({ controlId: 'a' }), rec({ controlId: 'b' })]);
    expect(g.a.length).toBe(2);
    expect(g.b.length).toBe(1);
  });
});

describe('compliance-evidence-collector.presentEvidence', () => {
  it('present set', () => {
    const p = presentEvidence([rec({ controlId: 'a', kind: 'query_log' }), rec({ controlId: 'a', kind: 'change_log' })]);
    expect(p.get('a')!.has('query_log')).toBe(true);
  });
});

describe('compliance-evidence-collector.totals', () => {
  it('counts', () => {
    expect(totals([rec(), rec()]).count).toBe(2);
  });
});

describe('compliance-evidence-collector.isFresh / dropStale', () => {
  it('fresh', () => {
    expect(isFresh(rec({ collectedAt: '2026-08-25' }), '2026-08-26')).toBe(true);
  });
  it('drops', () => {
    expect(dropStale([rec({ collectedAt: '2026-08-01' })], '2025-01-01').length).toBe(0);
  });
});
