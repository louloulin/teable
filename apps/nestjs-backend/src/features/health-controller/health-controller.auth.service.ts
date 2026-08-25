/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Health controller — NestJS auth service (Stage 98).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildSnapshot,
  isLive,
  isReady,
  syntheticCheck,
} from './health-controller.service';
import type { IHealthSnapshot } from './health-controller.types';

@Injectable()
export class HealthControllerAuthService {
  private readonly startTimeMs = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  /** Health snapshot — calls wired services to compose checks. */
  async health(input: { appName: string; version: string }): Promise<IHealthSnapshot> {
    const checks = await this.collectChecks();
    return buildSnapshot({
      appName: input.appName,
      version: input.version,
      checks,
      uptimeMs: Date.now() - this.startTimeMs,
      now: new Date().toISOString(),
    });
  }

  /** Liveness — true when not unhealthy. */
  async live(input: { appName: string; version: string }): Promise<boolean> {
    const s = await this.health(input);
    return isLive(s);
  }

  /** Readiness — true when healthy. */
  async ready(input: { appName: string; version: string }): Promise<boolean> {
    const s = await this.health(input);
    return isReady(s);
  }

  /** Just version info. */
  version(input: { version: string }): { version: string; appName: string; now: string } {
    return { version: input.version, appName: 'teable-backend', now: new Date().toISOString() };
  }

  /** Collect checks — wired to Prisma + synthetic for known services. */
  private async collectChecks(): Promise<ReturnType<typeof syntheticCheck>[]> {
    const checks: ReturnType<typeof syntheticCheck>[] = [];
    // Prisma
    try {
      const start = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push({ name: 'prisma', ok: true, durationMs: Date.now() - start });
    } catch (e) {
      checks.push({
        name: 'prisma',
        ok: false,
        durationMs: 0,
        detail: e instanceof Error ? e.message : 'unknown',
      });
    }
    // Synthetic checks for Stage 90-94 modules
    checks.push(syntheticCheck('module-wiring'));
    checks.push(syntheticCheck('controller-factory'));
    checks.push(syntheticCheck('interceptor-guard'));
    checks.push(syntheticCheck('openapi-metadata'));
    checks.push(syntheticCheck('e2e-test-utils'));
    return checks;
  }
}