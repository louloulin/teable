/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Billing — metered invoice worker (Phase 5.5 cron).
 *
 * Period-end cron that materializes draft invoices for subscriptions
 * whose `currentPeriodEnd <= now()`. The worker is the missing caller
 * for `BillingMeteredInvoiceService.materializeMeteredInvoice` (Round
 * 15): without it, that capability is dead code — usage events are
 * recorded and add-ons are activated, but nothing rolls them up into
 * a draft invoice at the end of the period.
 *
 * Same shape as `BillingDunningWorkerService` (Round 10):
 *
 *   - `processDueInvoices(input)` is a pure orchestration method that
 *     selects due subscriptions and invokes `materializeMeteredInvoice`
 *     for each. It is fully unit-testable without touching timers.
 *   - `onModuleInit` arms a `setInterval` whose period defaults to
 *     `DEFAULT_WORKER_INTERVAL_MS` (5 minutes) and is configurable via
 *     `BILLING_METERED_INVOICE_WORKER_INTERVAL_MS`. Set the env var
 *     `BILLING_METERED_INVOICE_WORKER_DISABLED=1` to opt out (tests,
 *     read-only instances, or a deployment that wants to drive the
 *     worker from an external pg-boss / cron sidecar).
 *   - `onModuleDestroy` clears the timer.
 *
 * Idempotency: the underlying `materializeMeteredInvoice` is already
 * idempotent (its default `externalInvoiceId` is keyed by
 * `(organizationId, periodStart)`). A second tick on the same period
 * reports `created=false` and the worker counts it as a `noop`, not
 * a re-billing.
 *
 * License: AGPL-3.0
 */
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  BillingMeteredInvoiceService,
  type IMetricRateCard,
} from './billing-metered-invoice.service';

export interface IProcessDueInvoicesInput {
  /** Wall-clock for deterministic tests. Defaults to `new Date()`. */
  asOf?: Date;
  /** Cap on subscriptions scanned per tick (clamped to `[1, 1000]`). */
  limit?: number;
  /** Rate cards to price the overage against. */
  rateCards: ReadonlyArray<IMetricRateCard>;
}

export interface IProcessDueInvoicesError {
  subscriptionId: string;
  organizationId: string;
  error: string;
}

export interface IProcessDueInvoicesResult {
  scanned: number;
  /** Subscriptions for which a fresh draft invoice row was created. */
  materialized: number;
  /**
   * Subscriptions for which `materializeMeteredInvoice` returned
   * `created=false` (already invoiced from a previous tick) or the
   * `noop` sentinel (zero grand total).
   */
  noop: number;
  errors: number;
  errorDetails: IProcessDueInvoicesError[];
}

export const DEFAULT_WORKER_INTERVAL_MS = 5 * 60 * 1000;

/**
 * OSS default rate cards. Mirrors `BillingPortalController`'s
 * `DEFAULT_RATE_CARDS` so the worker writes the same draft amounts
 * the Customer Portal displays for the same period. Cloud replaces
 * this with a per-org plan-aware loader behind the same export.
 */
export const DEFAULT_WORKER_RATE_CARDS: ReadonlyArray<IMetricRateCard> = [
  {
    metric: 'ai_credits',
    includedQuantity: 10_000,
    tiers: [{ threshold: 1_000_000, unitCents: 0.01 }],
  },
  {
    metric: 'automation_runs',
    includedQuantity: 1_000,
    tiers: [{ threshold: 100_000, unitCents: 0.05 }],
  },
  {
    metric: 'records',
    includedQuantity: 50_000,
    tiers: [{ threshold: 5_000_000, unitCents: 0.001 }],
  },
  {
    metric: 'storage_bytes',
    includedQuantity: 5n * 1024n * 1024n * 1024n,
    tiers: [{ threshold: 1024n * 1024n * 1024n * 1024n, unitCents: 0.0001 }],
  },
];

/** Subscription statuses that are eligible for a period-end invoice. */
const BILLABLE_STATUSES = ['active', 'past_due'] as const;

@Injectable()
export class BillingMeteredInvoiceWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BillingMeteredInvoiceWorkerService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly meteredInvoice: BillingMeteredInvoiceService
  ) {}

  onModuleInit(): void {
    if (process.env.BILLING_METERED_INVOICE_WORKER_DISABLED === '1') {
      this.logger.log('metered-invoice worker disabled by env');
      return;
    }
    const envMs = process.env.BILLING_METERED_INVOICE_WORKER_INTERVAL_MS;
    const parsed = envMs ? Number(envMs) : NaN;
    const intervalMs =
      Number.isFinite(parsed) && parsed >= 1000
        ? parsed
        : DEFAULT_WORKER_INTERVAL_MS;
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) =>
        this.logger.error(
          `metered-invoice tick failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        )
      );
    }, intervalMs);
    // Avoid keeping the process alive purely for the worker (tests,
    // graceful shutdown, etc.).
    this.timer.unref?.();
    this.logger.log(`metered-invoice worker armed (intervalMs=${intervalMs})`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Scan for subscriptions whose period has ended and materialize a
   * draft invoice for each. Failures on a single subscription do not
   * abort the loop — they are captured in `errorDetails` so the cron
   * wrapper can surface them to logs / alerting.
   */
  async processDueInvoices(
    input: IProcessDueInvoicesInput
  ): Promise<IProcessDueInvoicesResult> {
    const asOf = input.asOf ?? new Date();
    const requestedLimit = input.limit ?? 200;
    const limit = Math.max(1, Math.min(1000, requestedLimit));

    const dueSubs = await this.prisma.subscription.findMany({
      where: {
        currentPeriodEnd: { lte: asOf },
        status: { in: [...BILLABLE_STATUSES] },
      },
      take: limit,
      orderBy: { currentPeriodEnd: 'asc' },
    });

    const result: IProcessDueInvoicesResult = {
      scanned: dueSubs.length,
      materialized: 0,
      noop: 0,
      errors: 0,
      errorDetails: [],
    };

    for (const sub of dueSubs) {
      try {
        const out = await this.meteredInvoice.materializeMeteredInvoice({
          organizationId: sub.organizationId,
          subscriptionId: sub.id,
          periodStart: sub.currentPeriodStart,
          periodEnd: sub.currentPeriodEnd,
          rateCards: input.rateCards,
          asOf,
        });
        if (out.invoice.id === 'noop') {
          // Zero grand total — preview was non-empty but added up to
          // nothing (every metric fully covered by included+addon).
          result.noop += 1;
        } else if (out.created) {
          result.materialized += 1;
        } else {
          // A row already exists from a previous tick — idempotent noop.
          result.noop += 1;
        }
      } catch (err) {
        result.errors += 1;
        result.errorDetails.push({
          subscriptionId: sub.id,
          organizationId: sub.organizationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  private async tick(): Promise<void> {
    const r = await this.processDueInvoices({
      rateCards: DEFAULT_WORKER_RATE_CARDS,
    });
    if (r.scanned > 0 || r.errors > 0) {
      this.logger.log(
        `metered-invoice tick: scanned=${r.scanned} materialized=${r.materialized} noop=${r.noop} errors=${r.errors}`
      );
    }
  }
}
