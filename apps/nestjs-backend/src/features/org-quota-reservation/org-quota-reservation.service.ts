/**
 * Org-level quota reservation — pure helpers (Stage 73).
 */

import type {
  IOrgQuotaReservation,
  IOrgQuotaReservationOptions,
  IReservationDecision,
  ReservationPriority,
  ReservationStatus,
} from './org-quota-reservation.types';
import {
  DEFAULT_RESERVATION_TTL_MS,
  MAX_RESERVATIONS_PER_ORG,
  MIN_RESERVATION_AMOUNT,
  PRIORITY_RANK,
  RESERVATION_PRIORITIES,
  RESERVATION_STATUSES,
} from './org-quota-reservation.types';

/** Whether the input is a recognized reservation status. */
export function isReservationStatus(s: string): s is ReservationStatus {
  return (RESERVATION_STATUSES as ReadonlyArray<string>).includes(s);
}

/** Whether the input is a recognized priority. */
export function isReservationPriority(s: string): s is ReservationPriority {
  return (RESERVATION_PRIORITIES as ReadonlyArray<string>).includes(s);
}

/** Maximum reservations per org. */
export function maxReservationsPerOrg(opts?: IOrgQuotaReservationOptions): number {
  return opts?.maxReservationsPerOrg ?? MAX_RESERVATIONS_PER_ORG;
}

/** Default TTL. */
export function defaultReservationTtlMs(): number {
  return DEFAULT_RESERVATION_TTL_MS;
}

/** Priority ranking — higher = more protected. */
export function priorityRank(p: ReservationPriority): number {
  return PRIORITY_RANK[p];
}

/** Validate a reservation. */
export function validateReservation(r: IOrgQuotaReservation): string | null {
  if (!r.id) return 'id required';
  if (!r.orgId) return 'orgId required';
  if (!r.baseId) return 'baseId required';
  if (!r.metric) return 'metric required';
  if (r.amount < MIN_RESERVATION_AMOUNT) {
    return `amount must be ≥ ${MIN_RESERVATION_AMOUNT}`;
  }
  if (!isReservationStatus(r.status)) return `unknown status: ${r.status}`;
  if (!isReservationPriority(r.priority)) return `unknown priority: ${r.priority}`;
  return null;
}

/** Normalize a reservation input. */
export function normalizeReservation(input: {
  id: string;
  orgId: string;
  baseId: string;
  metric: string;
  amount: number;
  priority?: ReservationPriority;
  ttlMs?: number;
  reason?: string;
  now?: string;
}): IOrgQuotaReservation {
  const nowIso = input.now ?? new Date().toISOString();
  const expiresAtMs = new Date(nowIso).getTime() + (input.ttlMs ?? DEFAULT_RESERVATION_TTL_MS);
  return {
    id: input.id,
    orgId: input.orgId,
    baseId: input.baseId,
    metric: input.metric,
    amount: Math.max(MIN_RESERVATION_AMOUNT, Math.floor(input.amount)),
    priority: input.priority ?? 'normal',
    status: 'active',
    expiresAt: new Date(expiresAtMs).toISOString(),
    consumed: false,
    reason: input.reason ?? '',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Compute expired reservations against a given "now". */
export function sweepExpired(input: { reservations: IOrgQuotaReservation[]; now?: string }): {
  fresh: IOrgQuotaReservation[];
  expired: IOrgQuotaReservation[];
} {
  const nowIso = input.now ?? new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const fresh: IOrgQuotaReservation[] = [];
  const expired: IOrgQuotaReservation[] = [];
  for (const r of input.reservations) {
    if (r.status !== 'active') {
      fresh.push(r);
      continue;
    }
    if (new Date(r.expiresAt).getTime() <= nowMs) {
      expired.push({ ...r, status: 'expired', updatedAt: nowIso });
    } else {
      fresh.push(r);
    }
  }
  return { fresh, expired };
}

/** Compute the total reserved amount for a (orgId, metric) tuple. */
export function totalReserved(input: {
  orgId: string;
  metric: string;
  reservations: IOrgQuotaReservation[];
}): number {
  return input.reservations
    .filter((r) => r.orgId === input.orgId && r.metric === input.metric && r.status === 'active')
    .reduce((acc, r) => acc + r.amount, 0);
}

/** Mark a reservation as released. */
export function releaseReservation(input: {
  reservation: IOrgQuotaReservation;
  now?: string;
}): IOrgQuotaReservation {
  const nowIso = input.now ?? new Date().toISOString();
  return {
    ...input.reservation,
    status: 'released',
    updatedAt: nowIso,
  };
}

/** Mark a reservation as consumed (the base is using its reserved slice). */
export function consumeReservation(input: {
  reservation: IOrgQuotaReservation;
  now?: string;
}): IOrgQuotaReservation {
  const nowIso = input.now ?? new Date().toISOString();
  return {
    ...input.reservation,
    status: 'consumed',
    consumed: true,
    updatedAt: nowIso,
  };
}

/**
 * Decide whether a request fits within the org envelope given the
 * current reservations. Active+consumed reservations count against
 * capacity; active+unconsumed reservations are returned as available
 * but flagged as "reserved for others" so the caller can warn.
 */
export function decideReservation(input: {
  orgId: string;
  metric: string;
  /** Total org envelope for this metric (e.g. 1_000_000 rows). */
  envelope: number;
  /** Currently committed usage (active reservations + ad-hoc usage). */
  committed: number;
  reservations: IOrgQuotaReservation[];
  /** Requested amount. */
  requested: number;
}): IReservationDecision {
  const consumedReserved = input.reservations
    .filter(
      (r) =>
        r.orgId === input.orgId && r.metric === input.metric && r.status === 'active' && r.consumed
    )
    .reduce((acc, r) => acc + r.amount, 0);
  const reservedForOthers = input.reservations
    .filter(
      (r) =>
        r.orgId === input.orgId && r.metric === input.metric && r.status === 'active' && !r.consumed
    )
    .reduce((acc, r) => acc + r.amount, 0);
  const used = input.committed + consumedReserved;
  const remaining = Math.max(0, input.envelope - used);
  const allow = input.requested <= remaining;
  const reservationsAffecting = input.reservations
    .filter((r) => r.orgId === input.orgId && r.metric === input.metric && r.status === 'active')
    .map((r) => r.id);
  return {
    allow,
    effectiveRemaining: remaining,
    reservedForOthers,
    reservationsAffecting,
  };
}

/** Whether the org can register another reservation. */
export function canReserveMore(currentCount: number, opts?: IOrgQuotaReservationOptions): boolean {
  return currentCount < maxReservationsPerOrg(opts);
}

/** Decide whether a new reservation can evict an existing one (priority rules). */
export function canEvict(input: {
  existing: IOrgQuotaReservation;
  newPriority: ReservationPriority;
}): boolean {
  return priorityRank(input.newPriority) > priorityRank(input.existing.priority);
}
