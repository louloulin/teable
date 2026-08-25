/**
 * Data Residency — Stage 34.
 *
 * Pure helpers for parsing the region header and deciding
 * whether cross-region traffic is allowed.
 */

import type { IDataResidencyPolicy, IRegion, IResolvedRegionRoute } from './data-residency.types';
import { HEADER_REGION } from './data-residency.types';

const REGION_CODE_REGEX = /^[a-z]{2}$/;

export function isValidRegionCode(code: string): boolean {
  return REGION_CODE_REGEX.test(code);
}

/** Read region from an HTTP header bag (case-insensitive key lookup). */
export function parseRegionHeader(
  headers: Record<string, string | string[] | undefined> | null | undefined
): string | null {
  if (!headers) return null;
  const target = HEADER_REGION.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) {
      const raw = headers[k];
      if (Array.isArray(raw)) return raw[0] ?? null;
      return typeof raw === 'string' ? raw : null;
    }
  }
  return null;
}

/** Normalize a header value into a 2-letter code or null. */
export function normalizeRegionFromHeader(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!REGION_CODE_REGEX.test(trimmed)) return null;
  return trimmed;
}

/**
 * Decide whether the request can be served given:
 * - The region the request is asking for (`requestRegion`)
 * - The org's policy (`policy`)
 * - The destination region's status
 *
 * Rules:
 * - Same-region always allowed
 * - Cross-region allowed only if policy allows AND target is not draining/offline
 * - Locked policy pins to one region; cross-region requests are denied
 */
export function resolveRegionRoute(input: {
  requestRegion: string | null;
  policy: IDataResidencyPolicy | null;
  targetRegion: IRegion | null;
}): IResolvedRegionRoute {
  if (!input.requestRegion || !isValidRegionCode(input.requestRegion)) {
    return {
      requestRegion: input.requestRegion ?? '',
      policyRegion: input.policy?.regionCode ?? '',
      allowed: false,
      reason: 'unknown-region',
    };
  }
  if (!input.policy) {
    return {
      requestRegion: input.requestRegion,
      policyRegion: '',
      allowed: false,
      reason: 'no-policy',
    };
  }
  if (input.requestRegion === input.policy.regionCode) {
    return {
      requestRegion: input.requestRegion,
      policyRegion: input.policy.regionCode,
      allowed: true,
      reason: 'same-region',
    };
  }
  // Cross-region request
  if (input.policy.locked) {
    return {
      requestRegion: input.requestRegion,
      policyRegion: input.policy.regionCode,
      allowed: false,
      reason: 'policy-locked',
    };
  }
  if (!input.targetRegion) {
    return {
      requestRegion: input.requestRegion,
      policyRegion: input.policy.regionCode,
      allowed: false,
      reason: 'unknown-region',
    };
  }
  if (input.targetRegion.status === 'draining' || input.targetRegion.status === 'offline') {
    return {
      requestRegion: input.requestRegion,
      policyRegion: input.policy.regionCode,
      allowed: false,
      reason: 'target-draining',
    };
  }
  return {
    requestRegion: input.requestRegion,
    policyRegion: input.policy.regionCode,
    allowed: true,
    reason: 'target-active',
  };
}

/** Validate a region code's compatibility with a status update. */
export function isValidStatusTransition(from: IRegion['status'], to: IRegion['status']): boolean {
  const allow: Record<IRegion['status'], ReadonlyArray<IRegion['status']>> = {
    active: ['draining', 'offline'],
    draining: ['active', 'offline'],
    offline: ['active'],
  };
  return allow[from]?.includes(to) ?? false;
}

/** Build the policy row. */
export function buildPolicyRow(input: {
  id: string;
  organizationId: string;
  regionCode: string;
  locked: boolean;
  updatedBy: string;
  now?: Date;
}): IDataResidencyPolicy {
  return {
    id: input.id,
    organizationId: input.organizationId,
    regionCode: input.regionCode,
    locked: input.locked,
    updatedBy: input.updatedBy,
    updatedTime: input.now ?? new Date(),
  };
}

/** Build the region row. */
export function buildRegionRow(input: {
  id: string;
  code: string;
  displayName: string;
  status?: IRegion['status'];
  dataCenterLocation?: string | null;
  now?: Date;
}): IRegion {
  return {
    id: input.id,
    code: input.code,
    displayName: input.displayName,
    status: input.status ?? 'active',
    dataCenterLocation: input.dataCenterLocation ?? null,
    createdTime: input.now ?? new Date(),
    updatedTime: input.now ?? new Date(),
  };
}

export const HEADER_NAME = HEADER_REGION;
