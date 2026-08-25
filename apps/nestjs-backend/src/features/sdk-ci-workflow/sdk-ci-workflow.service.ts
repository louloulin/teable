/**
 * SDK CI Workflow — pure helpers (Stage 119).
 */

import {
  CiJob,
  CiRunOptions,
  CiRunResult,
  CiStep,
  CiWorkflowSpec,
  DEFAULT_RUNS_ON,
} from './sdk-ci-workflow.types';

/** Build the standard SDK CI workflow. */
export function buildSdkWorkflow(name: string, branches: readonly string[] = ['main']): CiWorkflowSpec {
  return {
    name,
    on: {
      push: { branches: [...branches] },
      pullRequest: { branches: [...branches] },
      release: { types: ['published'] },
    },
    jobs: [
      jobInstall(),
      jobLint(),
      jobTest(),
      jobCodegen(),
      jobSign(),
      jobPublish(),
    ],
  };
}

function jobInstall(): CiJob {
  return {
    id: 'install',
    name: 'Install',
    runsOn: DEFAULT_RUNS_ON,
    steps: [
      { name: 'checkout', run: 'actions/checkout@v4', label: 'Checkout' },
      { name: 'setup-node', run: 'actions/setup-node@v4', label: 'Node' },
      { name: 'setup-python', run: 'actions/setup-python@v5', label: 'Python' },
      { name: 'pnpm-install', run: 'pnpm install --frozen-lockfile', label: 'pnpm install' },
    ],
  };
}

function jobLint(): CiJob {
  return {
    id: 'lint',
    name: 'Lint',
    runsOn: DEFAULT_RUNS_ON,
    needs: ['install'],
    steps: [
      { name: 'lint', run: 'pnpm exec eslint .', required: true, label: 'ESLint' },
      { name: 'format', run: 'pnpm exec prettier --check .', label: 'Prettier' },
    ],
  };
}

function jobTest(): CiJob {
  return {
    id: 'test',
    name: 'Test',
    runsOn: DEFAULT_RUNS_ON,
    needs: ['install'],
    steps: [
      { name: 'unit', run: 'pnpm -r test', required: true, label: 'Unit tests' },
      { name: 'coverage', run: 'pnpm -r test --coverage', label: 'Coverage' },
    ],
  };
}

function jobCodegen(): CiJob {
  return {
    id: 'codegen',
    name: 'Codegen',
    runsOn: DEFAULT_RUNS_ON,
    needs: ['install'],
    steps: [
      { name: 'openapi-export', run: 'pnpm exec ts-node scripts/export-openapi.ts', required: true, label: 'Export OpenAPI' },
      { name: 'sdk-js', run: 'pnpm exec ts-node scripts/codegen-sdk-js.ts', required: true, label: 'SDK JS' },
      { name: 'sdk-py', run: 'pnpm exec ts-node scripts/codegen-sdk-py.ts', required: true, label: 'SDK Python' },
    ],
  };
}

function jobSign(): CiJob {
  return {
    id: 'sign',
    name: 'Sign',
    runsOn: DEFAULT_RUNS_ON,
    needs: ['codegen', 'test'],
    steps: [
      { name: 'cosign', run: 'cosign sign-blob --output-signature artifacts/sdk-js.sig artifacts/sdk-js.tgz', required: true, label: 'cosign sign JS' },
      { name: 'cosign-py', run: 'cosign sign-blob --output-signature artifacts/sdk-py.sig artifacts/sdk-py.tar.gz', required: true, label: 'cosign sign Python' },
    ],
  };
}

function jobPublish(): CiJob {
  return {
    id: 'publish',
    name: 'Publish',
    runsOn: DEFAULT_RUNS_ON,
    needs: ['sign', 'lint'],
    publishGate: true,
    steps: [
      { name: 'npm', run: 'pnpm publish --access public --tag latest', required: true, label: 'npm publish' },
      { name: 'pypi', run: 'twine upload artifacts/sdk-py.tar.gz', required: true, label: 'PyPI publish' },
    ],
  };
}

/** Topologically order jobs by `needs`. */
export function orderJobs(jobs: readonly CiJob[]): CiJob[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const visited = new Set<string>();
  const out: CiJob[] = [];
  function visit(id: string, stack: Set<string>): void {
    if (visited.has(id)) return;
    if (stack.has(id)) throw new Error(`cycle: ${id}`);
    stack.add(id);
    const job = byId.get(id);
    if (job?.needs) for (const n of job.needs) visit(n, stack);
    stack.delete(id);
    visited.add(id);
    if (job) out.push(job);
  }
  for (const j of jobs) visit(j.id, new Set());
  return out;
}

/** Validate a workflow (no missing deps, no cycles). */
export function validateWorkflow(spec: CiWorkflowSpec): { ok: boolean; reason?: string } {
  const ids = new Set(spec.jobs.map((j) => j.id));
  for (const j of spec.jobs) {
    if (!j.needs) continue;
    for (const n of j.needs) if (!ids.has(n)) return { ok: false, reason: `job ${j.id} needs missing ${n}` };
  }
  orderJobs(spec.jobs); // throws on cycle
  return { ok: true };
}

/** Simulate a workflow run against the spec. */
export function runWorkflow(spec: CiWorkflowSpec, sha: string, opts: CiRunOptions = {}): CiRunResult {
  const ordered = orderJobs(spec.jobs);
  const results: Array<{ jobId: string; ok: boolean; failedStep?: string }> = [];
  for (const j of ordered) {
    let ok = true;
    let failed: string | undefined;
    if (opts.dryRun && j.publishGate) {
      results.push({ jobId: j.id, ok: true });
      continue;
    }
    for (const s of j.steps) {
      if (s.required && s.run.startsWith('FAIL:')) {
        ok = false;
        failed = s.name;
        break;
      }
    }
    results.push({ jobId: j.id, ok, failedStep: failed });
    if (!ok) break;
  }
  return { workflowName: spec.name, jobResults: results, sha };
}

/** Serialize the workflow to a YAML-ish text. */
export function serializeWorkflow(spec: CiWorkflowSpec): string {
  const lines: string[] = [`name: ${spec.name}`, 'on:'];
  if (spec.on.push) lines.push('  push:', `    branches: [${spec.on.push.branches.join(', ')}]`);
  if (spec.on.pullRequest) lines.push('  pull_request:', `    branches: [${spec.on.pullRequest.branches.join(', ')}]`);
  if (spec.on.release) lines.push('  release:', `    types: [${spec.on.release.types.join(', ')}]`);
  lines.push('jobs:');
  for (const j of spec.jobs) {
    lines.push(`  ${j.id}:`);
    lines.push(`    runs-on: ${j.runsOn}`);
    if (j.needs) lines.push(`    needs: [${j.needs.join(', ')}]`);
    lines.push('    steps:');
    for (const s of j.steps) lines.push(`      - name: ${s.label ?? s.name}\n        run: ${s.run}`);
  }
  return lines.join('\n');
}

/** Add a step to a job. */
export function appendStep(job: CiJob, step: CiStep): CiJob {
  return { ...job, steps: [...job.steps, step] };
}

/** Detect publish jobs. */
export function publishJobs(spec: CiWorkflowSpec): CiJob[] {
  return spec.jobs.filter((j) => j.publishGate);
}

/** Get all step names. */
export function stepNames(spec: CiWorkflowSpec): string[] {
  return spec.jobs.flatMap((j) => j.steps.map((s) => `${j.id}::${s.name}`));
}