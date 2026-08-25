/**
 * SDK CI Workflow — types (Stage 119).
 *
 * GitHub Actions-style CI for SDK monorepo (build, test, codegen, lint, sign, publish).
 */

export interface CiStep {
  name: string;
  run: string;
  /** When true, errors here fail the run. */
  required?: boolean;
  /** Display label. */
  label?: string;
}

export interface CiJob {
  id: string;
  name: string;
  runsOn: string;
  steps: readonly CiStep[];
  needs?: readonly string[];
  /** True when this job is the publish gate. */
  publishGate?: boolean;
}

export interface CiWorkflowSpec {
  name: string;
  on: { push?: { branches: readonly string[] }; pullRequest?: { branches: readonly string[] }; release?: { types: readonly string[] } };
  env?: Record<string, string>;
  jobs: readonly CiJob[];
}

export interface CiRunResult {
  workflowName: string;
  jobResults: ReadonlyArray<{ jobId: string; ok: boolean; failedStep?: string }>;
  /** SHA of the commit. */
  sha: string;
}

export interface CiRunOptions {
  /** If true, skip the publish job. */
  dryRun?: boolean;
}

export const DEFAULT_RUNS_ON = 'ubuntu-latest';