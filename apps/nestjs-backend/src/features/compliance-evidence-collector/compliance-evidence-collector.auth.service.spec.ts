/**
 * Compliance Evidence Collector — NestJS auth service spec (Stage 123).
 */

import { ComplianceEvidenceCollectorAuthService } from './compliance-evidence-collector.auth.service';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new ComplianceEvidenceCollectorAuthService(makePrisma() as never);
}

describe('ComplianceEvidenceCollectorAuthService.buildId / hash / validId', () => {
  it('buildId', () => {
    expect(setup().buildId('a', 'b', 'c')).toMatch(/^evi_/);
  });
  it('hash', () => {
    expect(setup().hash('hello')).toHaveLength(64);
  });
  it('validId', () => {
    expect(setup().validId('evi_abcdef12')).toBe(true);
    expect(setup().validId('bad')).toBe(false);
  });
});

describe('ComplianceEvidenceCollectorAuthService.collect / filter / group', () => {
  it('collect', () => {
    const r = setup().collect({
      candidates: [{ controlId: 'a', kind: 'query_log', content: 'x', source: 's' }],
      now: '2026-08-25',
    });
    expect(r.records.length).toBe(1);
  });
  it('filter', () => {
    const rec = { id: 'evi_a', controlId: 'a', kind: 'query_log' as const, collectedAt: '2026-08-01', coversFrom: '2026-08-01', coversTo: '2026-08-01', source: 's', contentHash: 'h', sizeBytes: 1 };
    expect(setup().filter([rec], { controlId: 'a' }).length).toBe(1);
  });
  it('group', () => {
    const rec = { id: 'evi_a', controlId: 'a', kind: 'query_log' as const, collectedAt: '2026-08-01', coversFrom: '2026-08-01', coversTo: '2026-08-01', source: 's', contentHash: 'h', sizeBytes: 1 };
    expect(setup().group([rec]).a.length).toBe(1);
  });
});

describe('ComplianceEvidenceCollectorAuthService.present / sum / fresh / drop', () => {
  it('present', () => {
    const rec = { id: 'evi_a', controlId: 'a', kind: 'query_log' as const, collectedAt: '2026-08-01', coversFrom: '2026-08-01', coversTo: '2026-08-01', source: 's', contentHash: 'h', sizeBytes: 1 };
    expect(setup().present([rec]).get('a')!.has('query_log')).toBe(true);
  });
  it('sum', () => {
    expect(setup().sum([]).count).toBe(0);
  });
  it('fresh', () => {
    const rec = { id: 'evi_a', controlId: 'a', kind: 'query_log' as const, collectedAt: '2026-08-25', coversFrom: '2026-08-25', coversTo: '2026-08-25', source: 's', contentHash: 'h', sizeBytes: 1 };
    expect(setup().fresh(rec, '2026-08-26')).toBe(true);
  });
  it('drop', () => {
    const rec = { id: 'evi_a', controlId: 'a', kind: 'query_log' as const, collectedAt: '2026-08-25', coversFrom: '2026-08-25', coversTo: '2026-08-25', source: 's', contentHash: 'h', sizeBytes: 1 };
    expect(setup().drop([rec], '2026-08-26').length).toBe(1);
  });
});

describe('ComplianceEvidenceCollectorAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});