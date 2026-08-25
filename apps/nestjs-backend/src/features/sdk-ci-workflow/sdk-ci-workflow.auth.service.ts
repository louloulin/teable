/**
 * SDK CI Workflow — NestJS auth service (Stage 119).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

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
import {
  CiJob,
  CiRunOptions,
  CiRunResult,
  CiStep,
  CiWorkflowSpec,
} from './sdk-ci-workflow.types';

@Injectable()
export class SdkCiWorkflowAuthService {
  constructor(private readonly prisma: PrismaService) {}

  build(name: string, branches: readonly string[] = ['main']): CiWorkflowSpec {
    return buildSdkWorkflow(name, branches);
  }

  order(spec: CiWorkflowSpec): CiJob[] {
    return orderJobs(spec.jobs);
  }

  validate(spec: CiWorkflowSpec) {
    return validateWorkflow(spec);
  }

  run(spec: CiWorkflowSpec, sha: string, opts?: CiRunOptions): CiRunResult {
    return runWorkflow(spec, sha, opts);
  }

  serialize(spec: CiWorkflowSpec): string {
    return serializeWorkflow(spec);
  }

  append(job: CiJob, step: CiStep): CiJob {
    return appendStep(job, step);
  }

  publishes(spec: CiWorkflowSpec): CiJob[] {
    return publishJobs(spec);
  }

  steps(spec: CiWorkflowSpec): string[] {
    return stepNames(spec);
  }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}