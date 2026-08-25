/**
 * License key self up/downgrade — types (Stage 82).
 */

export const LICENSE_TIERS = ['community', 'pro', 'business', 'enterprise'] as const;
export type LicenseTier = (typeof LICENSE_TIERS)[number];

/** Numeric rank used for upgrade/downgrade direction. */
export const LICENSE_TIER_RANK: Readonly<Record<LicenseTier, number>> = {
  community: 0,
  pro: 1,
  business: 2,
  enterprise: 3,
};

/** Cooldown between tier changes (30 days). */
export const LICENSE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

/** Maximum days a tier change can be scheduled in advance. */
export const LICENSE_MAX_SCHEDULE_MS = 90 * 24 * 60 * 60 * 1000;

/** Default billing cycle used for proration math (30 days). */
export const LICENSE_PRORATION_CYCLE_DAYS = 30;

/** Tier pricing used by proration — in cents per cycle. */
export const LICENSE_TIER_CENTS: Readonly<Record<LicenseTier, number>> = {
  community: 0,
  pro: 2400,
  business: 7900,
  enterprise: 19900,
};

export type TierChangeDirection = 'upgrade' | 'downgrade' | 'lateral';

export interface ITierChangeRequest {
  licenseId: string;
  from: LicenseTier;
  to: LicenseTier;
  effectiveAt: string;
  reason?: string;
  actorId?: string;
}

export interface ITierChangeAudit {
  id: string;
  licenseId: string;
  from: LicenseTier;
  to: LicenseTier;
  direction: TierChangeDirection;
  effectiveAt: string;
  reason?: string;
  actorId?: string;
  createdAt: string;
}

export interface IProrationPreview {
  fromCents: number;
  toCents: number;
  daysRemaining: number;
  deltaCents: number;
  direction: TierChangeDirection;
}

export interface ICooldownStatus {
  canChange: boolean;
  remainingMs: number;
  nextAllowedAt: string;
}
