/**
 * SDK Publish Orchestrator — NestJS auth service spec (Stage 120).
 */

import { SdkPublishOrchestratorAuthService } from './sdk-publish-orchestrator.auth.service';
import { PackageDescriptor } from './sdk-publish-orchestrator.types';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new SdkPublishOrchestratorAuthService(makePrisma() as never);
}
function npm(name: string, version: string): PackageDescriptor {
  return { name, registry: 'npm', artifactPath: `${name}.tgz`, version };
}
function py(name: string, version: string): PackageDescriptor {
  return { name, registry: 'pypi', artifactPath: `${name}.tar.gz`, version };
}

describe('SdkPublishOrchestratorAuthService.bump / bumpAll', () => {
  it('bump patch', () => {
    expect(setup().bump('1.0.0', 'patch')).toBe('1.0.1');
  });
  it('bumpAll', () => {
    const out = setup().bumpAll([npm('a', '1.0.0'), py('b', '2.0.0')], 'minor');
    expect(out[0].version).toBe('1.1.0');
    expect(out[1].version).toBe('2.1.0');
  });
});

describe('SdkPublishOrchestratorAuthService.plan / cmd / changelog', () => {
  it('plan', () => {
    const p = setup().plan([npm('a', '1.0.0')], ['c']);
    expect(p.steps.length).toBe(1);
  });
  it('cmd', () => {
    expect(setup().cmd({ registry: 'npm', packageName: 'a', version: '1', artifact: 'a.tgz' }, 'latest')).toContain('npm');
  });
  it('changelog', () => {
    const p = setup().plan([npm('a', '1.0.0')], ['c']);
    expect(setup().changelog(p)).toContain('1.0.0');
  });
});

describe('SdkPublishOrchestratorAuthService.changed / signed / order / run / summary', () => {
  it('changed', () => {
    expect(setup().changed([npm('a', '1.0.0')], [npm('a', '1.0.1')])).toEqual(['a']);
  });
  it('signed', () => {
    expect(setup().signed([{ ...npm('a', '1.0.0'), signature: 'sig' }])).toBe(true);
  });
  it('order', () => {
    expect(setup().order([{ registry: 'pypi', packageName: 'p', version: '1.0.0', artifact: 'a' }])[0].registry).toBe('pypi');
  });
  it('run', () => {
    const r = setup().run(setup().plan([npm('a', '1.0.0')], ['c']), { bump: { kind: 'patch' }, dryRun: true });
    expect(r.results[0].ok).toBe(true);
  });
  it('summary', () => {
    const r = setup().run(setup().plan([npm('a', '1.0.0')], ['c']), { bump: { kind: 'patch' }, dryRun: true });
    expect(setup().summary(r).total).toBe(1);
  });
});

describe('SdkPublishOrchestratorAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});