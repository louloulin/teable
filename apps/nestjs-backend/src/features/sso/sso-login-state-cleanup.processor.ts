import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '@teable/db-main-prisma';
import { Queue } from 'bullmq';
import type { Job } from 'bullmq';

import {
  SSO_LOGIN_STATE_CLEANUP_QUEUE,
  SSO_LOGIN_STATE_CLEANUP_REPEAT_MS,
  SSO_LOGIN_STATE_TTL_MS,
} from './sso.constants';

/**
 * Stage 4.2 — Background cleanup for expired `SsoLoginState` rows.
 *
 * The table accumulates a row per SSO login attempt (with `state`,
 * `emailHint`, and `redirectTo` — all PII). We delete rows whose
 * `createdAt` is older than `SSO_LOGIN_STATE_TTL_MS` (5 minutes) so
 * the table never grows unbounded and so a leaked row auto-expires
 * within ~6 minutes of a stale attempt.
 *
 * Single SQL `deleteMany` — no select-then-delete dance, so concurrent
 * runs can't double-delete or race on the same id. `consumed=true` is
 * intentionally NOT a filter: once the callback completes the row has
 * served its purpose and a subsequent cleanup pass removes it.
 */
@Injectable()
@Processor(SSO_LOGIN_STATE_CLEANUP_QUEUE, { concurrency: 1 })
export class SsoLoginStateCleanupProcessor
  extends WorkerHost
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SsoLoginStateCleanupProcessor.name);
  private started = false;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(SSO_LOGIN_STATE_CLEANUP_QUEUE) private readonly queue: Queue
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    if (this.started) return;
    this.started = true;
    // Idempotent: BullMQ dedupes by jobId, so re-runs of onModuleInit won't
    // queue duplicate repeatables.
    await this.queue.add(
      'cleanup',
      {},
      {
        jobId: 'sso-login-state-cleanup-repeat',
        repeat: { every: SSO_LOGIN_STATE_CLEANUP_REPEAT_MS },
        removeOnComplete: 50,
        removeOnFail: 100,
      }
    );
    this.logger.log(`scheduled SsoLoginState cleanup every ${SSO_LOGIN_STATE_CLEANUP_REPEAT_MS}ms`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }

  async process(_job: Job<unknown>): Promise<{ deleted: number }> {
    const cutoff = new Date(Date.now() - SSO_LOGIN_STATE_TTL_MS);
    const result = await this.prisma.ssoLoginState.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`deleted ${result.count} expired SsoLoginState rows`);
    }
    return { deleted: result.count };
  }
}
