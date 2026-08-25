/**
 * SDK Publish Orchestrator — NestJS auth service (Stage 120).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

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
import {
  BumpType,
  PackageDescriptor,
  PublishOptions,
  PublishPlan,
  PublishReport,
  PublishStep,
} from './sdk-publish-orchestrator.types';

@Injectable()
export class SdkPublishOrchestratorAuthService {
  constructor(private readonly prisma: PrismaService) {}

  bump(version: string, kind: BumpType['kind']): string {
    return bumpVersion(version, kind);
  }

  bumpAll(packages: readonly PackageDescriptor[], kind: BumpType['kind']): PackageDescriptor[] {
    return bumpPackages(packages, kind);
  }

  plan(packages: readonly PackageDescriptor[], commits: readonly string[]): PublishPlan {
    return buildPlan(packages, commits);
  }

  cmd(step: PublishStep, tag: string): string {
    return publishCommand(step, tag);
  }

  changelog(plan: PublishPlan): string {
    return renderChangelog(plan.changelog);
  }

  changed(prev: readonly PackageDescriptor[], next: readonly PackageDescriptor[]): string[] {
    return detectChanges(prev, next);
  }

  signed(packages: readonly PackageDescriptor[]): boolean {
    return allSigned(packages);
  }

  order(steps: readonly PublishStep[]): PublishStep[] {
    return publishOrder(steps);
  }

  run(plan: PublishPlan, options: PublishOptions): PublishReport {
    return runPublish(plan, options);
  }

  summary(report: PublishReport) {
    return summarizePublish(report);
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