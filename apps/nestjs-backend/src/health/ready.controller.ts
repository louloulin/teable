/**
 * Readiness probe — `GET /readyz`.
 *
 * Returns 200 only when every dependency the pod needs to serve traffic is
 * reachable:
 *   - Postgres  (SELECT 1)
 *   - Redis     (PING)
 *   - Redis     (PING; this is also the BullMQ backing service)
 *
 * Each dependency check is wrapped in its own try/catch so one slow check
 * cannot hold the response — they all run in parallel via `Promise.all`. A
 * failing dep returns 503 with a per-dep breakdown so an operator looking at
 * `kubectl describe pod` immediately sees which dep is misbehaving.
 *
 * The DB/Redis clients are looked up from the NestJS DI container at request
 * time using their real provider classes. Missing required providers are
 * reported as unavailable rather than producing a false healthy response.
 *
 * License: AGPL-3.0
 */

import { Controller, Get, Res, type Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '@teable/db-main-prisma';
import type { Response } from 'express';
import { RedisNativeService } from '../cache/redis-native.service';
import type { ICacheConfig } from '../configs/cache.config';
import { Public } from '../features/auth/decorators/public.decorator';

type DepResult = {
  ok: boolean;
  // eslint-disable-next-line @typescript-eslint/naming-convention
  latency_ms: number;
  error?: string;
};

const DI_TIMEOUT_MS = 1500;

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} check exceeded ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkDb(
  indicator: PrismaHealthIndicator,
  client: PrismaService
): Promise<DepResult> {
  const start = Date.now();
  try {
    await withTimeout(indicator.pingCheck('database', client), DI_TIMEOUT_MS, 'db');
    return { ok: true, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkRedis(client: unknown): Promise<DepResult> {
  const start = Date.now();
  try {
    await withTimeout((client as RedisNativeService).ping(), DI_TIMEOUT_MS, 'redis');
    return { ok: true, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

@Controller()
@Public()
export class ReadyController {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly prismaHealthIndicator: PrismaHealthIndicator,
    private readonly configService: ConfigService
  ) {}

  @Get('readyz')
  async ready(@Res({ passthrough: true }) response: Response): Promise<{
    status: 'ok' | 'unavailable';
    checks: Record<string, DepResult>;
  }> {
    const db = this.tryResolve(PrismaService);
    const redis = this.tryResolve(RedisNativeService);
    const cache = this.configService.get<ICacheConfig>('cache');
    const cacheProvider = cache?.provider ?? 'sqlite';

    const [dbR, redisR] = await Promise.all([
      db
        ? checkDb(this.prismaHealthIndicator, db as PrismaService)
        : Promise.resolve(this.missingDependency('db')),
      cacheProvider === 'redis'
        ? redis
          ? checkRedis(redis)
          : Promise.resolve(this.missingDependency('redis'))
        : Promise.resolve({ ok: true, latency_ms: 0 }),
    ]);

    const checks: Record<string, DepResult> = {};
    checks.db = dbR;
    checks.redis = redisR;

    const allOk = Object.values(checks).every((c) => c.ok);
    if (!allOk) {
      response.status(503);
      return { status: 'unavailable', checks };
    }
    return { status: 'ok', checks };
  }

  /**
   * Resolves a DI token, returning undefined when it is not registered.
   */
  private tryResolve(token: Type<unknown>): unknown {
    try {
      return this.moduleRef.get(token, { strict: false });
    } catch {
      return undefined;
    }
  }

  private missingDependency(name: string): DepResult {
    return { ok: false, latency_ms: 0, error: `${name} dependency is not registered` };
  }
}
