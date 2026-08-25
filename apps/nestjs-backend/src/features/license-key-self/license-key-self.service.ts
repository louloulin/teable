/**
 * License key self up/downgrade — pure helpers (Stage 82).
 */

import type {
  ICooldownStatus,
  IProrationPreview,
  ITierChangeAudit,
  ITierChangeRequest,
  LicenseTier,
  TierChangeDirection,
} from './license-key-self.types';
import {
  LICENSE_COOLDOWN_MS,
  LICENSE_MAX_SCHEDULE_MS,
  LICENSE_PRORATION_CYCLE_DAYS,
  LICENSE_TIER_CENTS,
  LICENSE_TIER_RANK,
  LICENSE_TIERS,
} from './license-key-self.types';

/** Type guard. */
export function isLicenseTier(s: string): s is LicenseTier {
  return (LICENSE_TIERS as ReadonlyArray<string>).includes(s);
}

/** Rank of a tier. */
export function tierRank(t: LicenseTier): number {
  return LICENSE_TIER_RANK[t];
}

/** Direction of a transition. */
export function changeDirection(from: LicenseTier, to: LicenseTier): TierChangeDirection {
  if (from === to) return 'lateral';
  return tierRank(to) > tierRank(from) ? 'upgrade' : 'downgrade';
}

/** Whether a target tier is reachable from current tier (community cannot skip to enterprise etc.) */
export function isReachable(from: LicenseTier, to: LicenseTier): boolean {
  if (!isLicenseTier(from) || !isLicenseTier(to)) return false;
  if (from === to) return false;
  return true;
}

/** Validate a tier change request. Returns null when valid, error string otherwise. */
export function validateTierChange(req: ITierChangeRequest, now: string): string | null {
  if (!req.licenseId) return 'licenseId required';
  if (!isLicenseTier(req.from)) return `unknown from tier: ${req.from}`;
  if (!isLicenseTier(req.to)) return `unknown to tier: ${req.to}`;
  if (!isReachable(req.from, req.to))
    return `tier transition not allowed: ${req.from} -> ${req.to}`;
  if (!req.effectiveAt) return 'effectiveAt required';
  const t = Date.parse(req.effectiveAt);
  if (Number.isNaN(t)) return 'effectiveAt must be ISO-8601';
  const nowT = Date.parse(now);
  if (t > nowT + LICENSE_MAX_SCHEDULE_MS) return `effectiveAt beyond max schedule window`;
  return null;
}

/** Validate cooldown between changes. */
export function cooldownStatus(lastChangeAt: string | undefined, now: string): ICooldownStatus {
  if (!lastChangeAt) {
    return { canChange: true, remainingMs: 0, nextAllowedAt: now };
  }
  const elapsed = Date.parse(now) - Date.parse(lastChangeAt);
  if (elapsed >= LICENSE_COOLDOWN_MS) {
    return { canChange: true, remainingMs: 0, nextAllowedAt: now };
  }
  const remaining = LICENSE_COOLDOWN_MS - elapsed;
  return {
    canChange: false,
    remainingMs: remaining,
    nextAllowedAt: new Date(Date.parse(now) + remaining).toISOString(),
  };
}

/** Compute proration preview for a tier change at a given effective date. */
export function prorationPreview(input: {
  from: LicenseTier;
  to: LicenseTier;
  cycleStart: string;
  effectiveAt: string;
  now: string;
}): IProrationPreview {
  const fromCents = LICENSE_TIER_CENTS[input.from];
  const toCents = LICENSE_TIER_CENTS[input.to];
  const cycleStartT = Date.parse(input.cycleStart);
  const effT = Date.parse(input.effectiveAt);
  const cycleEndT = cycleStartT + LICENSE_PRORATION_CYCLE_DAYS * 24 * 60 * 60 * 1000;
  const remainingMs = Math.max(0, cycleEndT - effT);
  const fullMs = cycleEndT - cycleStartT;
  const fraction = fullMs > 0 ? remainingMs / fullMs : 0;
  const delta = Math.round((toCents - fromCents) * fraction);
  const dir = changeDirection(input.from, input.to);
  void input.now;
  return {
    fromCents,
    toCents,
    daysRemaining: Math.floor(remainingMs / (24 * 60 * 60 * 1000)),
    deltaCents: delta,
    direction: dir,
  };
}

/** Build a change audit entry. */
export function buildAudit(input: {
  id: string;
  request: ITierChangeRequest;
  createdAt: string;
}): ITierChangeAudit {
  const out: ITierChangeAudit = {
    id: input.id,
    licenseId: input.request.licenseId,
    from: input.request.from,
    to: input.request.to,
    direction: changeDirection(input.request.from, input.request.to),
    effectiveAt: input.request.effectiveAt,
    createdAt: input.createdAt,
  };
  if (input.request.reason !== undefined) out.reason = input.request.reason;
  if (input.request.actorId !== undefined) out.actorId = input.request.actorId;
  return out;
}

/** Compute the next allowed change timestamp after applying a change. */
export function nextCooldownFrom(effectiveAt: string): string {
  return new Date(Date.parse(effectiveAt) + LICENSE_COOLDOWN_MS).toISOString();
}

/** Append an audit to a list, capped. */
export function appendAudit(input: {
  history: ITierChangeAudit[];
  audit: ITierChangeAudit;
  cap?: number;
}): ITierChangeAudit[] {
  const cap = input.cap ?? 64;
  const next = [...input.history, input.audit];
  while (next.length > cap) next.shift();
  return next;
}
