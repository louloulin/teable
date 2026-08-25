/**
 * SDK Publish Orchestrator — pure helpers spec (Stage 120).
 */

import {
  allSigned,
  bumpPackages,
  bumpVersion,
  buildPlan,
  detectChanges,
  publishCommand,
  publishOrder,
  renderChangelog,
  runPublish,
  summarizePublish,
} from './sdk-publish-orchestrator.service';
import { PackageDescriptor } from './sdk-publish-orchestrator.types';

function npm(name: string, version: string): PackageDescriptor {
  return { name, registry: 'npm', artifactPath: `dist/${name}.tgz`, version };
}
function py(name: string, version: string): PackageDescriptor {
  return { name, registry: 'pypi', artifactPath: `dist/${name}.tar.gz`, version };
}

describe('sdk-publish-orchestrator.bumpVersion', () => {
  it('patch', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
  });
  it('minor', () => {
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
  });
  it('major', () => {
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });
  it('invalid', () => {
    expect(() => bumpVersion('abc', 'patch')).toThrow();
  });
});

describe('sdk-publish-orchestrator.bumpPackages', () => {
  it('bumps all', () => {
    const out = bumpPackages([npm('@teable/sdk', '0.1.0'), py('teable-sdk', '0.1.0')], 'minor');
    expect(out[0].version).toBe('0.2.0');
    expect(out[1].version).toBe('0.2.0');
  });
});

describe('sdk-publish-orchestrator.buildPlan', () => {
  it('plan', () => {
    const p = buildPlan([npm('@teable/sdk', '0.2.0')], ['fix: x', 'feat: y']);
    expect(p.steps.length).toBe(1);
    expect(p.versions['@teable/sdk']).toBe('0.2.0');
    expect(p.changelog[0].changes.length).toBe(2);
  });
});

describe('sdk-publish-orchestrator.publishCommand', () => {
  it('npm', () => {
    expect(publishCommand({ registry: 'npm', packageName: 'a', version: '1', artifact: 'a.tgz' }, 'latest')).toContain('npm publish');
  });
  it('pypi', () => {
    expect(publishCommand({ registry: 'pypi', packageName: 'a', version: '1', artifact: 'a.tar.gz' }, 'latest')).toContain('twine');
  });
});

describe('sdk-publish-orchestrator.renderChangelog', () => {
  it('md', () => {
    const out = renderChangelog([{ version: '0.1.0', date: '2026-01-01', changes: ['fix'] }]);
    expect(out).toContain('## 0.1.0');
    expect(out).toContain('- fix');
  });
});

describe('sdk-publish-orchestrator.detectChanges', () => {
  it('detects version changes', () => {
    expect(detectChanges([npm('a', '1.0.0')], [npm('a', '1.0.1')])).toEqual(['a']);
  });
  it('no change', () => {
    expect(detectChanges([npm('a', '1.0.0')], [npm('a', '1.0.0')])).toEqual([]);
  });
});

describe('sdk-publish-orchestrator.allSigned', () => {
  it('all', () => {
    expect(allSigned([{ ...npm('a', '1'), signature: 'sig' }])).toBe(true);
  });
  it('missing', () => {
    expect(allSigned([npm('a', '1')])).toBe(false);
  });
});

describe('sdk-publish-orchestrator.publishOrder', () => {
  it('npm before pypi', () => {
    const ordered = publishOrder([
      { registry: 'pypi', packageName: 'p', version: '1', artifact: 'a' },
      { registry: 'npm', packageName: 'n', version: '1', artifact: 'b' },
    ]);
    expect(ordered[0].registry).toBe('npm');
    expect(ordered[1].registry).toBe('pypi');
  });
});

describe('sdk-publish-orchestrator.runPublish', () => {
  it('happy', () => {
    const plan = buildPlan([npm('a', '1.0.0'), py('b', '1.0.0')], ['c1']);
    const r = runPublish(plan, { bump: { kind: 'patch' } });
    expect(summarizePublish(r).ok).toBe(2);
  });
  it('dryRun', () => {
    const plan = buildPlan([npm('a', '1')], ['c']);
    const r = runPublish(plan, { bump: { kind: 'patch' }, dryRun: true });
    expect(r.results.every((x) => x.ok)).toBe(true);
  });
});