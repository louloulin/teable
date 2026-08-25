/**
 * SDK CI Workflow — pure helpers spec (Stage 119).
 */

import {
  appendStep,
  buildSdkWorkflow,
  orderJobs,
  publishJobs,
  runWorkflow,
  serializeWorkflow,
  stepNames,
  validateWorkflow,
} from './sdk-ci-workflow.service';

describe('sdk-ci-workflow.buildSdkWorkflow', () => {
  it('contains all stages', () => {
    const w = buildSdkWorkflow('sdk-ci', ['main']);
    const ids = w.jobs.map((j) => j.id);
    expect(ids).toContain('install');
    expect(ids).toContain('lint');
    expect(ids).toContain('test');
    expect(ids).toContain('codegen');
    expect(ids).toContain('sign');
    expect(ids).toContain('publish');
  });
  it('publish gate', () => {
    expect(publishJobs(buildSdkWorkflow('x')).length).toBe(1);
  });
});

describe('sdk-ci-workflow.orderJobs', () => {
  it('orders by needs', () => {
    const w = buildSdkWorkflow('x');
    const ordered = orderJobs(w.jobs);
    expect(ordered[0].id).toBe('install');
    expect(ordered[ordered.length - 1].id).toBe('publish');
  });
});

describe('sdk-ci-workflow.validateWorkflow', () => {
  it('valid', () => {
    expect(validateWorkflow(buildSdkWorkflow('x')).ok).toBe(true);
  });
  it('missing dep', () => {
    const w = buildSdkWorkflow('x');
    const broken = { ...w, jobs: [...w.jobs.slice(0, 1), { id: 'z', name: 'z', runsOn: 'ubuntu', steps: [], needs: ['nonexistent'] }] };
    expect(validateWorkflow(broken).ok).toBe(false);
  });
  it('cycle', () => {
    const a = { id: 'a', name: 'a', runsOn: 'x', steps: [], needs: ['b'] } as import('./sdk-ci-workflow.types').CiJob;
    const b = { id: 'b', name: 'b', runsOn: 'x', steps: [], needs: ['a'] } as import('./sdk-ci-workflow.types').CiJob;
    expect(() => orderJobs([a, b])).toThrow();
  });
});

describe('sdk-ci-workflow.runWorkflow', () => {
  it('happy path', () => {
    const w = buildSdkWorkflow('x');
    const r = runWorkflow(w, 'sha123');
    expect(r.jobResults.every((j) => j.ok)).toBe(true);
    expect(r.sha).toBe('sha123');
  });
  it('dryRun skips publish', () => {
    const w = buildSdkWorkflow('x');
    const r = runWorkflow(w, 'sha', { dryRun: true });
    const pub = r.jobResults.find((j) => j.jobId === 'publish')!;
    expect(pub.ok).toBe(true);
  });
});

describe('sdk-ci-workflow.serializeWorkflow', () => {
  it('contains name and jobs', () => {
    const out = serializeWorkflow(buildSdkWorkflow('x'));
    expect(out).toContain('name: x');
    expect(out).toContain('install:');
    expect(out).toContain('publish:');
  });
});

describe('sdk-ci-workflow.appendStep / stepNames', () => {
  it('append', () => {
    const j = appendStep({ id: 'a', name: 'A', runsOn: 'x', steps: [{ name: 's1', run: 'echo 1' }] }, { name: 's2', run: 'echo 2' });
    expect(j.steps.length).toBe(2);
  });
  it('stepNames', () => {
    expect(stepNames(buildSdkWorkflow('x')).length).toBeGreaterThan(0);
  });
});