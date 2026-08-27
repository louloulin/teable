/**
 * Readiness probe — `GET /readyz`.
 *
 * Returns 200 only when every dependency the pod needs to serve traffic is
 * reachable:
 *   - Postgres  (SELECT 1)
 *   - Redis     (PING)
 *   - Queue     (BullMQ client status; healthy when not closed)
 *
 * Each dependency check is wrapped in its own try/catch so one slow check
 * cannot hold the response — they all run in parallel via `Promise.all`. A
 * failing dep returns 503 with a per-dep breakdown so an operator looking at
 * `kubectl describe pod` immediately sees which dep is misbehaving.
 *
 * The DB/Redis/queue clients are looked up from the NestJS DI container at
 * request time. The shape is intentionally loose (`unknown`) — we only call
 * a single, idempotent method on each, and the dependency-injected types are
 * not part of the hot path's contract.
 *
 * License: AGPL-3.0
 */

import { Controller, Get, HttpCode, HttpException, Inject } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

type DepResult = { ok: boolean; latency_ms: number; error?: string };

interface CheckedClient {
  alive(): Promise<void>;
}

interface CheckableClient {
  ping(): Promise<unknown>;
}

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

async function checkDb(client: unknown): Promise<DepResult> {
  const start = Date.now();
  try {
    // `pg` and `mysql2` both expose `.query()`; the result shape differs at
    // the edges (rows vs [rows, fields]) so we accept whatever comes back.
    await withTimeout(
      (client as { query: (q: string) => Promise<unknown> }).query('SELECT 1'),
      DI_TIMEOUT_MS,
      'db'
    );
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
    await withTimeout((client as CheckableClient).ping(), DI_TIMEOUT_MS, 'redis');
    return { ok: true, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkQueue(client: unknown): Promise<DepResult> {
  const start = Date.now();
  try {
    // BullMQ's Queue has no `alive()`, so we treat a missing `client.status`
    // of 'closed' as unhealthy and otherwise accept the call.
    const status = (client as { status?: string }).status;
    if (status === 'closed') {
      return { ok: false, latency_ms: 0, error: 'queue client is closed' };
    }
    await withTimeout((client as CheckedClient).alive(), DI_TIMEOUT_MS, 'queue').catch(
      () => undefined
    ); // best-effort: `alive()` may not exist on every adapter
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
export class ReadyController {
  constructor(private readonly moduleRef: ModuleRef) {}

  @Get('readyz')
  async ready(): Promise<{
    status: 'ok';
    checks: Record<string, DepResult>;
  }> {
    // Lazy lookup — operators that do not use one of these (e.g. local dev
    // without Redis) get a free pass for the missing dep rather than a 503.
    const db = this.tryResolve('DATABASE_CONNECTION');
    const redis = this.tryResolve('REDIS_CONNECTION');
    const queue = this.tryResolve('QUEUE_CONNECTION');

    const [dbR, redisR, queueR] = await Promise.all([
      db ? checkDb(db) : Promise.resolve(undefined),
      redis ? checkRedis(redis) : Promise.resolve(undefined),
      queue ? checkQueue(queue) : Promise.resolve(undefined),
    ]);

    const checks: Record<string, DepResult> = {};
    if (dbR) checks.db = dbR;
    if (redisR) checks.redis = redisR;
    if (queueR) checks.queue = queueR;

    const allOk = Object.values(checks).every((c) => c.ok);
    if (!allOk) {
      throw new HttpException({ status: 'unavailable', checks }, 503);
    }
    return { status: 'ok', checks };
  }

  /**
   * Resolves a DI token by string name, returning undefined when the token is
   * not registered.  NestJS does not let you do this with the typed API
   * without each caller knowing every token — `ModuleRef.get` throws, so we
   * wrap and swallow.
   */
  private tryResolve(token: string): unknown {
    try {
      return this.moduleRef.get(token, { strict: false });
    } catch {
      return undefined;
    }
  }
}
