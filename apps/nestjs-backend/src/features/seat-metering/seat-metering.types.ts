/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Seat metering — Stage 80.
 *
 * Counts active billable seats per org per billing cycle and computes
 * per-tier pricing. Cooperates with Stage 69 (Org-level 计费合并报表)
 * for invoice line items and Stage 65 (Org-level 配额编排) for caps.
 */

export type SeatTier = 'starter' | 'pro' | 'enterprise';
export type SeatStatus = 'active' | 'invited' | 'deactivated' | 'pending';

export interface ISeatAssignment {
  id: string;
  orgId: string;
  actorId: string;
  tier: SeatTier;
  status: SeatStatus;
  /** ISO assignedAt — used for pro-rata proration. */
  assignedAt: string;
  /** ISO removedAt — null while still assigned. */
  removedAt: string | null;
  /** ISO billing-cycle anchor (start of month for the seat). */
  cycleAnchor: string;
}

export interface ISeatCycle {
  id: string;
  orgId: string;
  tier: SeatTier;
  /** Inclusive cycle start ISO. */
  startedAt: string;
  /** Exclusive cycle end ISO. */
  endedAt: string;
  seatsActive: number;
  seatsProrated: number;
  unitPriceCents: number;
  totalCents: number;
}

export const SEAT_PRICES_CENTS: Record<SeatTier, number> = {
  starter: 800,
  pro: 2400,
  enterprise: 6400,
};

export const SEAT_MAX_PER_ORG = 10_000;
export const SEAT_CYCLE_DAYS = 30;
export const SEAT_PRORATION_DENOMINATOR = 30;
export const SEAT_TIERS: ReadonlyArray<SeatTier> = ['starter', 'pro', 'enterprise'];
export const SEAT_STATUSES: ReadonlyArray<SeatStatus> = [
  'active',
  'invited',
  'deactivated',
  'pending',
];
