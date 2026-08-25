/**
 * OpenAPI static generation — pure helpers spec (Stage 105).
 */

import {
  allHashed,
  artifactCount,
  buildArtifact,
  capArtifacts,
  changedFrom,
  findArtifact,
  hasHtmlArtifact,
  hasJsonArtifact,
  htmlArtifactPath,
  jsonArtifactPath,
  planBuild,
  sha256,
  validateBuildInput,
} from './openapi-static-gen.service';

describe('openapi-static-gen.jsonArtifactPath / htmlArtifactPath', () => {
  it('json', () => {
    expect(jsonArtifactPath({ root: '/x' })).toBe('openapi/teable.openapi.json');
  });
  it('json with name', () => {
    expect(jsonArtifactPath({ root: '/x', name: 'Stripe Bridge' })).toBe('openapi/stripe-bridge.openapi.json');
  });
  it('json subdir', () => {
    expect(jsonArtifactPath({ root: '/x', subdir: 'api' })).toBe('api/teable.openapi.json');
  });
  it('html', () => {
    expect(htmlArtifactPath({ root: '/x' })).toBe('openapi/index.html');
  });
});

describe('openapi-static-gen.sha256 / buildArtifact', () => {
  it('sha256 hex 64', () => {
    expect(sha256('hi')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('sha256 stable', () => {
    expect(sha256('hi')).toBe(sha256('hi'));
  });
  it('buildArtifact', () => {
    const a = buildArtifact({ path: '/p', body: 'abc', kind: 'json' });
    expect(a.bytes).toBe(3);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('openapi-static-gen.validateBuildInput / planBuild', () => {
  it('validate', () => {
    expect(validateBuildInput({ root: 'r', prettyJson: 'p' })).toBeNull();
    expect(validateBuildInput({ root: '', prettyJson: 'p' })).toContain('root');
    expect(validateBuildInput({ root: 'r', prettyJson: '' })).toContain('prettyJson');
  });
  it('plan without html', () => {
    const plan = planBuild({ root: '/x', prettyJson: '{}' });
    expect(plan.artifacts.length).toBe(1);
    expect(plan.artifacts[0]!.kind).toBe('json');
  });
  it('plan with html', () => {
    const plan = planBuild({ root: '/x', prettyJson: '{}', htmlBody: '<html></html>' });
    expect(plan.artifacts.length).toBe(2);
    expect(plan.artifacts[1]!.kind).toBe('html');
  });
});

describe('openapi-static-gen.findArtifact / has* / count', () => {
  const plan = planBuild({ root: '/x', prettyJson: '{}', htmlBody: '<html></html>' });
  it('find by path', () => {
    expect(findArtifact({ plan, path: 'openapi/teable.openapi.json' })?.kind).toBe('json');
    expect(findArtifact({ plan, path: 'nope' })).toBeNull();
  });
  it('hasJson / hasHtml', () => {
    expect(hasJsonArtifact(plan)).toBe(true);
    expect(hasHtmlArtifact(plan)).toBe(true);
  });
  it('count', () => {
    expect(artifactCount(plan)).toBe(2);
  });
});

describe('openapi-static-gen.capArtifacts / allHashed / changedFrom', () => {
  it('capArtifacts passes when under', () => {
    const plan = planBuild({ root: '/x', prettyJson: '{}', htmlBody: '<html></html>' });
    expect(capArtifacts(plan, 5).artifacts.length).toBe(2);
    expect(capArtifacts(plan, 1).artifacts.length).toBe(1);
  });
  it('allHashed true', () => {
    const plan = planBuild({ root: '/x', prettyJson: '{}' });
    expect(allHashed(plan)).toBe(true);
  });
  it('changedFrom false / true', () => {
    const a = planBuild({ root: '/x', prettyJson: '{"a":1}' });
    const b = planBuild({ root: '/x', prettyJson: '{"a":1}' });
    expect(changedFrom({ plan: a, previous: b })).toBe(false);
    const c = planBuild({ root: '/x', prettyJson: '{"a":2}' });
    expect(changedFrom({ plan: c, previous: a })).toBe(true);
  });
});
