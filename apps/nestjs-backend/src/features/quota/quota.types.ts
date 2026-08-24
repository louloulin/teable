import type { PlanLevel, QuotaMetric } from '@teable/db-main-prisma';

import type { IPlanLimits } from './quota.constants';

export interface IQuotaCheckResult {
  allowed: boolean;
  /** Human-readable reason; surfaced in 429 / 402 responses and the admin panel. */
  reason?: string;
  /** Effective cap (resolved against plan + add-ons); undefined when unlimited. */
  cap?: number | bigint | null;
  /** Counter value as observed at check time. */
  used?: number | bigint;
}

export interface IConsumeContext {
  actorId?: string;
  /** Free-form resource locator (e.g. `table:cuid`, `automation:cuid`). */
  resource?: string;
  /** Override the wall-clock period; primarily used by tests. */
  now?: Date;
}

export interface IUsageMetricSnapshot {
  metric: QuotaMetric;
  used: number | bigint;
  cap: number | bigint | null;
  unlimited: boolean;
  /** Server-resolved quota-hit reason; populated when the latest attempt was rejected. */
  lastHitReason?: string;
  lastHitAt?: Date;
}

export interface ISpaceUsageReport {
  spaceId: string;
  plan: PlanLevel;
  limits: IPlanLimits;
  periodStart?: string; // ISO date for periodic metrics
  metrics: IUsageMetricSnapshot[];
}

/** Input shape for `PUT /api/quota/:spaceId` (admin panel / license activation). */
export interface ISetSpaceQuotaInput {
  plan?: PlanLevel;
  limits?: Partial<IPlanLimits>;
  addons?: {
    rows?: number;
    automationRuns?: number;
    aiCredits?: number;
    attachmentBytes?: bigint | string;
  };
}