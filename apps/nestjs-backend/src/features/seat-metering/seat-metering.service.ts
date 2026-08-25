/**
 * Seat metering — pure helpers (Stage 80).
 */

import type { ISeatAssignment, ISeatCycle, SeatStatus, SeatTier } from './seat-metering.types';
import {
  SEAT_CYCLE_DAYS,
  SEAT_MAX_PER_ORG,
  SEAT_PRICES_CENTS,
  SEAT_PRORATION_DENOMINATOR,
  SEAT_STATUSES,
  SEAT_TIERS,
} from './seat-metering.types';

/** Whether the tier is canonical. */
export function isSeatTier(s: string): s is SeatTier {
  return (SEAT_TIERS as ReadonlyArray<string>).includes(s);
}

/** Whether the status is canonical. */
export function isSeatStatus(s: string): s is SeatStatus {
  return (SEAT_STATUSES as ReadonlyArray<string>).includes(s);
}

/** Unit price in cents for a tier. */
export function unitPriceCents(tier: SeatTier): number {
  return SEAT_PRICES_CENTS[tier];
}

/** Validate an assignment. */
export function validateAssignment(a: ISeatAssignment): string | null {
  if (!a.id) return 'id required';
  if (!a.orgId) return 'orgId required';
  if (!a.actorId) return 'actorId required';
  if (!isSeatTier(a.tier)) return `unknown tier: ${a.tier}`;
  if (!isSeatStatus(a.status)) return `unknown status: ${a.status}`;
  if (!a.assignedAt) return 'assignedAt required';
  if (!a.cycleAnchor) return 'cycleAnchor required';
  return null;
}

/** Whether an assignment counts toward seat usage. */
export function countsAsSeat(s: SeatStatus): boolean {
  return s === 'active' || s === 'invited' || s === 'pending';
}

/** Fraction of a cycle that the seat was active (0..1). */
export function activeFraction(input: {
  assignedAt: string;
  removedAt: string | null;
  cycleStart: string;
  cycleEnd: string;
}): number {
  const start = Math.max(
    new Date(input.assignedAt).getTime(),
    new Date(input.cycleStart).getTime()
  );
  const end = Math.min(
    input.removedAt ? new Date(input.removedAt).getTime() : new Date(input.cycleEnd).getTime(),
    new Date(input.cycleEnd).getTime()
  );
  const total = new Date(input.cycleEnd).getTime() - new Date(input.cycleStart).getTime();
  if (total <= 0) return 0;
  if (end <= start) return 0;
  return Math.min(1, Math.max(0, (end - start) / total));
}

/** Compute a prorated seat count: integer + fractional part. */
export function proratedSeats(input: {
  active: number;
  assignments: ISeatAssignment[];
  cycleStart: string;
  cycleEnd: string;
}): number {
  let total = 0;
  for (const a of input.assignments) {
    if (!countsAsSeat(a.status)) continue;
    total += activeFraction({
      assignedAt: a.assignedAt,
      removedAt: a.removedAt,
      cycleStart: input.cycleStart,
      cycleEnd: input.cycleEnd,
    });
  }
  // always at least `active` whole seats (current snapshot)
  return Math.max(input.active, total);
}

/** Roll up an org's seats for one tier into a billing cycle. */
export function buildCycle(input: {
  id: string;
  orgId: string;
  tier: SeatTier;
  startedAt: string;
  endedAt: string;
  assignments: ISeatAssignment[];
  activeSeats: number;
}): ISeatCycle {
  const seatsProrated = proratedSeats({
    active: input.activeSeats,
    assignments: input.assignments,
    cycleStart: input.startedAt,
    cycleEnd: input.endedAt,
  });
  const unit = unitPriceCents(input.tier);
  const total = Math.round(seatsProrated * unit);
  return {
    id: input.id,
    orgId: input.orgId,
    tier: input.tier,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    seatsActive: input.activeSeats,
    seatsProrated: Math.round(seatsProrated * 100) / 100,
    unitPriceCents: unit,
    totalCents: total,
  };
}

/** Compute the next cycle window. */
export function nextCycle(input: { anchor: string }): { startedAt: string; endedAt: string } {
  const start = new Date(input.anchor);
  const end = new Date(start.getTime() + SEAT_CYCLE_DAYS * 86_400_000);
  return { startedAt: start.toISOString(), endedAt: end.toISOString() };
}

/** Cap seats per org. */
export function maxSeatsPerOrg(): number {
  return SEAT_MAX_PER_ORG;
}

/** Total seat count in a list (active+invited+pending). */
export function totalActiveSeats(assignments: ISeatAssignment[]): number {
  return assignments.filter((a) => countsAsSeat(a.status)).length;
}

/** Sum cycles for invoice line items. */
export function sumCycles(cycles: ISeatCycle[]): { cents: number; seats: number } {
  let cents = 0;
  let seats = 0;
  for (const c of cycles) {
    cents += c.totalCents;
    seats += c.seatsProrated;
  }
  return { cents, seats };
}

/** Daily proration unit (1 / denominator). */
export function prorationUnit(): number {
  return 1 / SEAT_PRORATION_DENOMINATOR;
}
