/**
 * Compliance Control Map — NestJS auth service spec (Stage 122).
 */

import { ComplianceControlMapAuthService } from './compliance-control-map.auth.service';
import { ControlItem } from './compliance-control-map.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new ComplianceControlMapAuthService(makePrisma() as never);
}

describe('ComplianceControlMapAuthService.library / build', () => {
  it('library', () => {
    expect(setup().library().length).toBeGreaterThan(0);
  });
  it('build', () => {
    expect(setup().build().length).toBeGreaterThan(0);
  });
});

describe('ComplianceControlMapAuthService.byFramework / byCategory / reqs', () => {
  it('byFramework', () => {
    expect(setup().byFramework(setup().build(), 'SOC2').length).toBeGreaterThan(0);
  });
  it('byCategory', () => {
    expect(setup().byCategory(setup().build(), 'logging').length).toBeGreaterThan(0);
  });
  it('reqs', () => {
    const c = setup().library()[0];
    expect(setup().reqs(c).length).toBeGreaterThan(0);
  });
});

describe('ComplianceControlMapAuthService.update / validId', () => {
  it('update', () => {
    const c = setup().library()[0];
    const updated = setup().update(c, 'attested', '2026-08-25');
    expect(updated.status).toBe('attested');
  });
  it('validId', () => {
    expect(setup().validId('SOC2-CC6.1')).toBe(true);
    expect(setup().validId('random')).toBe(false);
  });
});

describe('ComplianceControlMapAuthService.missing / percent', () => {
  it('missing', () => {
    const report = setup().missing(setup().build(), new Map());
    expect(report.missing.length).toBeGreaterThan(0);
  });
  it('percent', () => {
    expect(setup().percent({ total: 0, attested: 0, verified: 0, failed: 0, missing: [] })).toBe(100);
  });
});

describe('ComplianceControlMapAuthService.serialize / hash', () => {
  it('serialize', () => {
    expect(setup().serialize(setup().build()).length).toBeGreaterThan(0);
  });
  it('hash', () => {
    expect(setup().hash(setup().build())).toHaveLength(8);
  });
});

describe('ComplianceControlMapAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});