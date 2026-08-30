/**
 * Compliance Audit Pack — pure helpers spec (Stage 124).
 */

import {
  CONTROL_CSV_HEADER,
  buildAuditPack,
  controlToCsv,
  filterByFormat,
  formatBytes,
  hasAllFormats,
  isPackIdValid,
  manifestToText,
  renderControlsCsv,
  renderEvidenceJsonl,
  renderPdfManifest,
  sha256,
  verifyPackIntegrity,
} from './compliance-audit-pack.service';
import { ControlItem } from '../compliance-control-map/compliance-control-map.types';
import { EvidenceRecord } from '../compliance-evidence-collector/compliance-evidence-collector.types';

function c(over: Partial<ControlItem> = {}): ControlItem {
  return {
    id: 'SOC2-CC6.1',
    framework: 'SOC2',
    category: 'access_control',
    title: 'Logical access',
    description: 'desc',
    evidence: ['query_log'],
    status: 'attested',
    ...over,
  };
}
function r(over: Partial<EvidenceRecord> = {}): EvidenceRecord {
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

describe('compliance-audit-pack.controlToCsv', () => {
  it('basic', () => {
    expect(controlToCsv(c()).startsWith('SOC2-CC6.1,SOC2,access_control,attested')).toBe(true);
  });
  it('escapes commas', () => {
    expect(controlToCsv(c({ title: 'a,b' })).includes('"a,b"')).toBe(true);
  });
});

describe('compliance-audit-pack.renderControlsCsv', () => {
  it('header', () => {
    expect(renderControlsCsv([]).startsWith(CONTROL_CSV_HEADER)).toBe(true);
  });
  it('rows', () => {
    expect(renderControlsCsv([c()]).split('\n').filter(Boolean).length).toBe(2);
  });
});

describe('compliance-audit-pack.renderEvidenceJsonl', () => {
  it('empty', () => {
    expect(renderEvidenceJsonl([])).toBe('');
  });
  it('lines', () => {
    expect(renderEvidenceJsonl([r(), r()]).split('\n').filter(Boolean).length).toBe(2);
  });
});

describe('compliance-audit-pack.renderPdfManifest', () => {
  it('sections', () => {
    const meta = { packId: 'p', generatedAt: '2026-08-25', framework: 'SOC2' as const, periodFrom: '2026-08-01', periodTo: '2026-08-25', contentHash: '', totalBytes: 0, artifactCount: 0 };
    const sections = renderPdfManifest({ meta, controls: [c()], records: [r()] });
    expect(sections.length).toBeGreaterThan(0);
  });
});

describe('compliance-audit-pack.manifestToText', () => {
  it('text', () => {
    expect(manifestToText([{ title: 'T', body: 'B' }]).includes('=== T ===')).toBe(true);
  });
});

describe('compliance-audit-pack.sha256', () => {
  it('stable', () => {
    expect(sha256('a')).toBe(sha256('a'));
  });
  it('64 hex', () => {
    expect(sha256('x').length).toBe(64);
  });
});

describe('compliance-audit-pack.buildAuditPack', () => {
  it('full pack', () => {
    const pack = buildAuditPack({ controls: [c()], records: [r()], generatedAt: '2026-08-25' });
    expect(pack.artifacts.length).toBe(3);
    expect(pack.meta.packId).toMatch(/^pack_/);
  });
  it('mixed framework', () => {
    const pack = buildAuditPack({ controls: [c(), c({ id: 'ISO-A.9.1', framework: 'ISO27001' })], records: [], generatedAt: '2026-08-25' });
    expect(pack.meta.framework).toBe('MIXED');
  });
  it('integrity', () => {
    const pack = buildAuditPack({ controls: [c()], records: [r()], generatedAt: '2026-08-25' });
    expect(verifyPackIntegrity(pack)).toBe(true);
  });
});

describe('compliance-audit-pack.filterByFormat / hasAllFormats', () => {
  it('filter', () => {
    const pack = buildAuditPack({ controls: [c()], records: [r()], generatedAt: '2026-08-25' });
    expect(filterByFormat(pack, 'csv').length).toBe(1);
  });
  it('all formats', () => {
    const pack = buildAuditPack({ controls: [c()], records: [r()], generatedAt: '2026-08-25' });
    expect(hasAllFormats(pack)).toBe(true);
  });
});

describe('compliance-audit-pack.isPackIdValid', () => {
  it('valid', () => expect(isPackIdValid('pack_abc12345')).toBe(true));
  it('invalid', () => expect(isPackIdValid('bad')).toBe(false));
});

describe('compliance-audit-pack.formatBytes', () => {
  it('B', () => expect(formatBytes(100)).toBe('100B'));
  it('KB', () => expect(formatBytes(2048)).toBe('2.0KB'));
  it('MB', () => expect(formatBytes(2 * 1024 * 1024)).toBe('2.00MB'));
});