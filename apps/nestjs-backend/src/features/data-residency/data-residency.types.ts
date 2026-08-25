/**
 * Data Residency — Stage 34 types.
 *
 * Region routing for self-hosted deployments and for any
 * future multi-region Cloud build-out. Policies pin an org to
 * a region; cross-region reads are allowed only if the target
 * region is not draining and the org's policy is not locked.
 */

export type RegionStatus = 'active' | 'draining' | 'offline';

export type RegionCode = 'us' | 'eu' | 'ap' | 'sa' | 'af' | 'ca';

export interface IRegion {
  id: string;
  code: string;
  displayName: string;
  status: RegionStatus;
  dataCenterLocation: string | null;
  createdTime: Date;
  updatedTime: Date;
}

export interface IDataResidencyPolicy {
  id: string;
  organizationId: string;
  regionCode: string;
  locked: boolean;
  updatedBy: string;
  updatedTime: Date;
}

export interface ISetPolicyInput {
  organizationId: string;
  regionCode: string;
  locked: boolean;
  updatedBy: string;
}

export interface IResolvedRegionRoute {
  /** The region the request *originated* from (header or default). */
  requestRegion: string;
  /** The region the org's policy pins to. */
  policyRegion: string;
  /** Whether the request should be allowed to cross regions. */
  allowed: boolean;
  reason:
    | 'same-region'
    | 'target-active'
    | 'target-draining'
    | 'policy-locked'
    | 'unknown-region'
    | 'no-policy';
}

export const HEADER_REGION = 'x-teable-region';
