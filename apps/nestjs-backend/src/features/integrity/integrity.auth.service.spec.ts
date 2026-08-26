/* eslint-disable @typescript-eslint/naming-convention */
import { vi } from 'vitest';

import { IntegrityAuthService } from './integrity.auth.service';
import { needsRepair, summarizeIssues } from './integrity.helpers';

interface IMockLinkIntegrityIssueTable {
  findMany: ReturnType<typeof vi.fn>;
}
interface IMockPrisma {
  linkIntegrityIssue: IMockLinkIntegrityIssueTable;
}

const buildPrisma = (): IMockPrisma => ({
  linkIntegrityIssue: { findMany: vi.fn() },
});

describe('IntegrityAuthService (thin-DI wrapper)', () => {
  let prisma: IMockPrisma;
  let svc: IntegrityAuthService;

  beforeEach(() => {
    prisma = buildPrisma();
    svc = new IntegrityAuthService(prisma as never);
  });

  it('summarize returns empty summary when no rows exist', async () => {
    prisma.linkIntegrityIssue.findMany.mockResolvedValueOnce([]);
    const out = await svc.summarize('tbl1');
    expect(out.totalIssues).toBe(0);
    expect(out.totalOrphans).toBe(0);
  });

  it('summarize aggregates orphan counts across rows', async () => {
    prisma.linkIntegrityIssue.findMany.mockResolvedValueOnce([
      { linkFieldId: 'f1', symmetricFieldId: 'sf1', orphanCount: 3 },
      { linkFieldId: 'f2', symmetricFieldId: 'sf2', orphanCount: 5 },
    ]);
    const out = await svc.summarize('tbl1');
    expect(out.totalIssues).toBe(2);
    expect(out.totalOrphans).toBe(8);
  });
});

describe('integrity helpers', () => {
  it('needsRepair flags non-zero summaries', () => {
    expect(needsRepair({ totalIssues: 0, totalOrphans: 0, issues: [] })).toBe(false);
    expect(needsRepair({ totalIssues: 1, totalOrphans: 0, issues: [] })).toBe(false);
    expect(needsRepair({ totalIssues: 1, totalOrphans: 2, issues: [] })).toBe(true);
  });

  it('summarizeIssues handles empty input', () => {
    expect(summarizeIssues([])).toEqual({ totalIssues: 0, totalOrphans: 0, issues: [] });
  });
});