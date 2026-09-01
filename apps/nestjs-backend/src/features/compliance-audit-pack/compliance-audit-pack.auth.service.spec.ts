/**
 * Compliance Audit Pack — NestJS auth service spec (Stage 124).
 */

import { ComplianceAuditPackAuthService } from './compliance-audit-pack.auth.service';
import { ControlItem } from '../compliance-control-map/compliance-control-map.types';
import { EvidenceRecord } from '../compliance-evidence-collector/compliance-evidence-collector.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
  complianceAuditPack: {
    upsert: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
}
function makePrisma(): IPrismaMock {
  return {
    $queryRaw: vi.fn(async () => [{ '?column?': 1 }]),
    complianceAuditPack: {
      upsert: vi.fn(async () => undefined),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      count: vi.fn(async () => 0),
    },
  };
}
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

describe('ComplianceAuditPackAuthService persistence', () => {
  it('persists a generated pack and lists metadata without artifact bodies', async () => {
    const prisma = makePrisma();
    const svc = new ComplianceAuditPackAuthService(prisma as never);
    const pack = svc.build({ controls: [c()], records: [r()], generatedAt: '2026-08-25' });
    await svc.persist(pack, 'usr_admin');
    expect(prisma.complianceAuditPack.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: pack.meta.packId },
      create: expect.objectContaining({ createdBy: 'usr_admin', artifacts: pack.artifacts }),
    }));

    prisma.complianceAuditPack.findMany.mockResolvedValueOnce([
      {
        id: pack.meta.packId,
        framework: pack.meta.framework,
        periodFrom: pack.meta.periodFrom,
        periodTo: pack.meta.periodTo,
        generatedAt: new Date(pack.meta.generatedAt),
        contentHash: pack.meta.contentHash,
        totalBytes: pack.meta.totalBytes,
        artifactCount: pack.meta.artifactCount,
        createdBy: 'usr_admin',
        createdTime: new Date(pack.meta.generatedAt),
      },
    ]);
    const listed = await svc.listPersisted();
    expect(listed).toHaveLength(1);
    expect(listed[0]).not.toHaveProperty('artifacts');
  });

  it('reconstructs a persisted pack and counts stored packs', async () => {
    const prisma = makePrisma();
    const svc = new ComplianceAuditPackAuthService(prisma as never);
    const pack = svc.build({ controls: [c()], records: [r()], generatedAt: '2026-08-25' });
    prisma.complianceAuditPack.findUnique.mockResolvedValueOnce({
      id: pack.meta.packId,
      framework: pack.meta.framework,
      periodFrom: pack.meta.periodFrom,
      periodTo: pack.meta.periodTo,
      generatedAt: new Date(pack.meta.generatedAt),
      contentHash: pack.meta.contentHash,
      totalBytes: pack.meta.totalBytes,
      artifactCount: pack.meta.artifactCount,
      artifacts: pack.artifacts,
    });
    prisma.complianceAuditPack.count.mockResolvedValueOnce(1);
    await expect(svc.getPersisted(pack.meta.packId)).resolves.toMatchObject({
      meta: {
        packId: pack.meta.packId,
        generatedAt: '2026-08-25T00:00:00.000Z',
        contentHash: pack.meta.contentHash,
      },
      artifacts: pack.artifacts,
    });
    await expect(svc.countPersisted()).resolves.toBe(1);
  });
});
