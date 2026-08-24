import type { PlanLevel } from '@teable/db-main-prisma';

import type { IPlanLimits } from '../quota/quota.constants';

/**
 * License key shape. The Teable Cloud activation flow uses Stripe-backed
 * signed JWTs; for self-host we accept either:
 *   - a signed JWT (production / Cloud), or
 *   - an opaque `plan:<plan>[:seats=N]` string (env-driven self-host activation).
 *
 * The signer / verification keys live in `TEABLE_LICENSE_PUBLIC_KEY`
 * (PEM, RS256) and `TEABLE_LICENSE_HMAC_SECRET` (HS256). On OSS / Standalone
 * neither is set — the gate is permanently open and `LicenseService` runs
 * through the env-token path only.
 */
export interface ILicenseClaims {
  plan: PlanLevel;
  seats?: number;
  /** epoch ms when the license expires; 0 = perpetual */
  expiresAt?: number;
  /** when set, only listed spaceIds are upgraded */
  spaceIds?: string[];
  /** add-ons */
  addons?: {
    rows?: number;
    automationRuns?: number;
    aiCredits?: number;
    attachmentBytes?: bigint | string;
  };
}

export interface IResolvedLicense {
  source: 'env' | 'jwt' | 'admin' | 'none';
  claims?: ILicenseClaims;
  effectiveLimits: IPlanLimits;
}

/** Sentinel for OSS / Standalone: no license ever needed. */
export const NO_LICENSE_SENTINEL = 'teable-oss-standalone';