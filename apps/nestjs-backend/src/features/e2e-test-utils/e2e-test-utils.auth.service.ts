/* eslint-disable @typescript-eslint/naming-convention */
/**
 * E2E test utils — NestJS auth service (Stage 94).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  composeHeaders,
  deepEqual,
  runAssertion,
  validateCall,
  validateFixture,
} from './e2e-test-utils.service';
import type {
  IApiCallInput,
  IApiCallResult,
  IAssertionInput,
  IAssertionResult,
  ITestFixture,
} from './e2e-test-utils.types';

@Injectable()
export class E2ETestUtilsAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Persist a fixture for replay across runs. */
  async saveFixture(input: { fixture: ITestFixture }): Promise<ITestFixture> {
    const err = validateFixture(input.fixture);
    if (err) throw new Error(err);
    await this.prisma.testFixture.upsert({
      where: { id: input.fixture.seed },
      create: {
        id: input.fixture.seed,
        seed: input.fixture.seed,
        org: input.fixture.org as object,
        users: input.fixture.users as object,
        tokens: input.fixture.tokens as object,
      },
      update: {
        org: input.fixture.org as object,
        users: input.fixture.users as object,
        tokens: input.fixture.tokens as object,
      },
    });
    return input.fixture;
  }

  /** Load a fixture by seed. */
  async loadFixture(input: { seed: string }): Promise<ITestFixture | null> {
    const row = await this.prisma.testFixture.findUnique({ where: { id: input.seed } });
    if (!row) return null;
    return {
      org: row['org'] as ITestFixture['org'],
      users: row['users'] as ITestFixture['users'],
      tokens: row['tokens'] as ITestFixture['tokens'],
      seed: String(row['seed']),
    };
  }

  /** Compose authorization headers for a fixture + user. */
  headersFor(input: { fixture: ITestFixture; userId: string }): Record<string, string> {
    const token = input.fixture.tokens[input.userId] ?? null;
    return composeHeaders({ token });
  }

  /** Validate an API call (pre-flight). */
  validateCall(call: IApiCallInput): string | null {
    return validateCall(call);
  }

  /** Build a synthetic call from a fixture — used by harness scripts. */
  buildCall(input: {
    userId: string;
    verb: IApiCallInput['verb'];
    path: string;
    body?: unknown;
  }): IApiCallInput {
    return {
      verb: input.verb,
      path: input.path,
      body: input.body,
      headers: { authorization: `Bearer placeholder` },
    };
  }

  /** Run a stored assertion. */
  runAssertion(a: IAssertionInput): IAssertionResult {
    return runAssertion(a);
  }

  /** Deep equal exposed for assertions. */
  deepEqual(a: unknown, b: unknown): boolean {
    return deepEqual(a, b);
  }

  /** Record a call result for later inspection. */
  async recordCall(input: {
    fixture: ITestFixture;
    call: IApiCallInput;
    result: IApiCallResult;
  }): Promise<void> {
    await this.prisma.testCallLog.create({
      data: {
        id: `${input.fixture.seed}-${Date.now()}`,
        seed: input.fixture.seed,
        verb: input.call.verb,
        path: input.call.path,
        status: input.result.status,
        durationMs: input.result.durationMs,
      },
    });
  }

  /** List call logs for a fixture seed. */
  async listCallLogs(input: { seed: string }): Promise<Array<{ verb: string; path: string; status: number }>> {
    const rows = await this.prisma.testCallLog.findMany({ where: { seed: input.seed } });
    return rows.map((r) => ({
      verb: String(r['verb']),
      path: String(r['path']),
      status: Number(r['status']),
    }));
  }
}