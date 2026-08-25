/**
 * SDK CI Workflow — NestJS auth service spec (Stage 119).
 */

import { SdkCiWorkflowAuthService } from './sdk-ci-workflow.auth.service';

interface IPrismaMock {
  $queryRaw: (template: TemplateStringsArray) => Promise<unknown>;
}
function makePrisma(): IPrismaMock { return { $queryRaw: vi.fn(async () => [{ '?column?': 1 }]) }; }
function setup() {
  return new SdkCiWorkflowAuthService(makePrisma() as never);
}

describe('SdkCiWorkflowAuthService.build / order / validate', () => {
  it('build', () => {
    expect(setup().build('x').jobs.length).toBeGreaterThan(0);
  });
  it('order', () => {
    const w = setup().build('x');
    expect(setup().order(w)[0].id).toBe('install');
  });
  it('validate', () => {
    expect(setup().validate(setup().build('x')).ok).toBe(true);
  });
});

describe('SdkCiWorkflowAuthService.run / serialize', () => {
  it('run', () => {
    const r = setup().run(setup().build('x'), 'sha1');
    expect(r.jobResults.length).toBeGreaterThan(0);
  });
  it('serialize', () => {
    expect(setup().serialize(setup().build('x')).length).toBeGreaterThan(0);
  });
});

describe('SdkCiWorkflowAuthService.append / publishes / steps', () => {
  it('append', () => {
    const w = setup().build('x');
    const j = setup().append(w.jobs[0], { name: 'extra', run: 'echo' });
    expect(j.steps.length).toBe(w.jobs[0].steps.length + 1);
  });
  it('publishes', () => {
    expect(setup().publishes(setup().build('x')).length).toBe(1);
  });
  it('steps', () => {
    expect(setup().steps(setup().build('x')).length).toBeGreaterThan(0);
  });
});

describe('SdkCiWorkflowAuthService.ping', () => {
  it('true', async () => {
    expect(await setup().ping()).toBe(true);
  });
});