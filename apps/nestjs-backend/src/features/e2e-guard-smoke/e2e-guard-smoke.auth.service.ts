/**
 * E2E guard smoke — NestJS auth service (Stage 102).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildCanonicalCases,
  capGuardCases,
  envelopeForCase,
  guardFailures,
  guardPassRate,
  runGuardSmoke,
  statusForOutcome,
} from './e2e-guard-smoke.service';
import type {
  IGuardSmokeCase,
  IGuardSmokeExecutor,
  IGuardSmokeReport,
  IGuardSmokeResult,
} from './e2e-guard-smoke.types';

@Injectable()
export class E2eGuardSmokeAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Build canonical case matrix (deny / allow / forbidden / errored). */
  buildCanonicalCases(input: { fixtureId: string }): IGuardSmokeCase[] {
    return buildCanonicalCases(input);
  }

  /** Cap cases. */
  cap(cases: ReadonlyArray<IGuardSmokeCase>): IGuardSmokeCase[] {
    return capGuardCases(cases);
  }

  /** Run the smoke against the executor. */
  async smoke(input: {
    cases: ReadonlyArray<IGuardSmokeCase>;
    executor?: IGuardSmokeExecutor;
  }): Promise<IGuardSmokeReport> {
    return runGuardSmoke({ cases: input.cases, executor: input.executor });
  }

  /** Failures from a report. */
  failures(report: IGuardSmokeReport): IGuardSmokeResult[] {
    return guardFailures(report);
  }

  /** Pass rate. */
  passRate(report: IGuardSmokeReport): number {
    return guardPassRate(report);
  }

  /** Synthesize an error envelope for diagnostics. */
  envelope(input: { case: IGuardSmokeCase; traceId: string }) {
    return envelopeForCase(input);
  }

  /** Status for an outcome. */
  statusFor(input: {
    outcome: IGuardSmokeResult['actual'];
    principal: string | null;
  }): number {
    return statusForOutcome(input);
  }

  /** Health probe. */
  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
