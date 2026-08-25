/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Org-level quota reservation — Stage 73.
 *
 * Stage 65 enforced quotas on a "current vs limit" basis. The Cloud
 * tweak is **soft reservations** — high-priority bases (billing,
 * executive dashboards) can pre-reserve a slice of the org envelope so
 * a noisy neighbour can't starve them when contention is high. The
 * enforcer treats reserved-but-unused quota as available for the rest
 * of the org, but reserved-and-used is deducted from the live budget.
 */

export type ReservationStatus = 'active' | 'released' | 'expired' | 'consumed';
export type ReservationPriority = 'critical' | 'high' | 'normal' | 'low';

export interface IOrgQuotaReservation {
  id: string;
  orgId: string;
  baseId: string;
  metric: string;
  /// Reserved amount (unit depends on metric: rows, ai-credits, requests/min, etc).
  amount: number;
  /// Reservation priority — critical reservations cannot be evicted by lower ones.
  priority: ReservationPriority;
  status: ReservationStatus;
  /// When the reservation expires (auto-released).
  expiresAt: string;
  /// Whether the reservation has been consumed (i.e., the base is actually using it).
  consumed: boolean;
  /// Who/what created the reservation.
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface IReservationDecision {
  allow: boolean;
  effectiveRemaining: number;
  reservedForOthers: number;
  reservationsAffecting: string[];
}

export interface IOrgQuotaReservationOptions {
  /// Override "now.
  now?: string;
  /// Maximum reservations per org.
  maxReservationsPerOrg?: number;
}

export const MAX_RESERVATIONS_PER_ORG = 256;
export const DEFAULT_RESERVATION_TTL_MS = 86_400_000 * 7;
export const MIN_RESERVATION_AMOUNT = 1;
export const RESERVATION_STATUSES: ReadonlyArray<ReservationStatus> = [
  'active',
  'released',
  'expired',
  'consumed',
];
export const RESERVATION_PRIORITIES: ReadonlyArray<ReservationPriority> = [
  'critical',
  'high',
  'normal',
  'low',
];

export const PRIORITY_RANK: Record<ReservationPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  active: '生效中',
  released: '已释放',
  expired: '已过期',
  consumed: '已使用',
};
