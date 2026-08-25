/**
 * Compliance Audit Pack — NestJS auth service spec (Stage 124).
 */

import { ComplianceAuditPackAuthService } from './compliance-audit-pack.auth.service';
import { ControlItem } from '../compliance-control-map/compliance-control-map.types';
import { EvidenceRecord } from '../compliance-evidence-collector/compliance-evidence-collector.types';

interface IPrismaMock { $queryRaw: (template: TemplateStringsArray) => Promise<unknown>; }
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() { return new ComplianceAuditPackAuthService(makePrisma() as never); }
function c(): ControlItem { return { id: 'SOC2-CC6.1', framework: 'SOC2', category: 'access_control', title: 't', description: 'd', evidence: ['query_log'], status: 'attested' }; }
function r(): EvidenceRecord { return { id: 'evi_a', controlId: 'SOC2-CC6.1', kind: 'query_log', collectedAt: '2026-08-01', coversFrom: '2026-08-01', coversTo: '2026-08-01', source: 's', contentHash: 'h', sizeBytes: 1 }; }

describe('ComplianceAuditPackAuthService.csv / jsonl / manifest', () => {
  it('csv', () => { expect(setup().csv([c()]).split('\n').filter(Boolean).length).toBe(2); });
  it('jsonl', () => { expect(setup().jsonl([])).toBe(''); });
  it('manifest', () => {
    const meta = { packId: 'p', generatedAt: '2026-08-25', framework: 'SOC2' as const, periodFrom: '2026-08-01', periodTo: '2026-08-25', contentHash: '', totalBytes: 0, artifactCount: 0 };
    expect(setup().manifest({ meta, controls: [c()], records: [] }).length).toBeGreaterThan(0);
  });
  it('manifestText', () => { expect(setup().manifestText([{ title: 'T', body: 'B' }]).includes('T')).toBe(true); });
  it('hash', () => { expect(setup().hash('x').length).toBe(64); });
});

describe('ComplianceAuditPackAuthService.build / filter / verify', () => {
  it('build', () => {
    const pack = setup().build({ controls: [c()], records: [r()], generatedAt: '2026-08-25' });
    expect(pack.artifacts.length).toBe(3);
  });
  it('filter', () => {
    const pack = setup().build({ controls: [c()], records: [r()], generatedAt: '2026-08-25' });
    expect(setup().filter(pack, 'csv').length).toBe(1);
  });
  it('verify', () => {
    const pack = setup().build({ controls: [c()], records: [r()], generatedAt: '2026-08-25' });
    expect(setup().verify(pack)).toBe(true);
  });
});

describe('ComplianceAuditPackAuthService.validId / fmt / complete / ping', () => {
  it('validId', () => { expect(setup().validId('pack_abc12345')).toBe(true); expect(setup().validId('bad')).toBe(false); });
  it('fmt', () => { expect(setup().fmt(100)).toBe('100B'); });
  it('complete', () => {
    const pack = setup().build({ controls: [c()], records: [r()], generatedAt: '2026-08-25' });
    expect(setup().complete(pack)).toBe(true);
  });
  it('ping', async () => { expect(await setup().ping()).toBe(true); });
});