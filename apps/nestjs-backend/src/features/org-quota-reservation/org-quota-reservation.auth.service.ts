/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Org-level quota reservation — NestJS auth service (Stage 73).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  canEvict,
  canReserveMore,
  consumeReservation,
  decideReservation,
  normalizeReservation,
  priorityRank,
  releaseReservation,
  sweepExpired,
  totalReserved,
  validateReservation,
} from './org-quota-reservation.service';
import type {
  IOrgQuotaReservation,
  IOrgQuotaReservationOptions,
  IReservationDecision,
  ReservationPriority,
} from './org-quota-reservation.types';

@Injectable()
export class OrgQuotaReservationAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate a reservation. */
  validate(r: IOrgQuotaReservation): string | null {
    return validateReservation(r);
  }

  /** Normalize a reservation. */
  normalize(input: {
    id: string;
    orgId: string;
    baseId: string;
    metric: string;
    amount: number;
    priority?: ReservationPriority;
    ttlMs?: number;
    reason?: string;
  }): IOrgQuotaReservation {
    return normalizeReservation(input);
  }

  /** Persist a reservation (upsert). */
  async upsertReservation(r: IOrgQuotaReservation): Promise<IOrgQuotaReservation> {
    const err = validateReservation(r);
    if (err) throw new Error(`invalid reservation: ${err}`);
    await this.prisma.orgQuotaReservation.upsert({
      where: { id: r.id },
      create: {
        id: r.id,
        orgId: r.orgId,
        baseId: r.baseId,
        metric: r.metric,
        amount: r.amount,
        priority: r.priority,
        status: r.status,
        expiresAt: new Date(r.expiresAt),
        consumed: r.consumed,
        reason: r.reason,
        createdAt: new Date(r.createdAt),
        updatedAt: new Date(r.updatedAt),
      },
      update: {
        amount: r.amount,
        priority: r.priority,
        status: r.status,
        expiresAt: new Date(r.expiresAt),
        consumed: r.consumed,
        reason: r.reason,
        updatedAt: new Date(r.updatedAt),
      },
    });
    return r;
  }

  /** Load a reservation by id. */
  async loadReservation(id: string): Promise<IOrgQuotaReservation | null> {
    const row = await this.prisma.orgQuotaReservation.findUnique({ where: { id } });
    return row ? toReservation(row) : null;
  }

  /** List reservations for an org. */
  async listReservations(orgId: string): Promise<IOrgQuotaReservation[]> {
    const rows = await this.prisma.orgQuotaReservation.findMany({ where: { orgId } });
    return rows.map(toReservation);
  }

  /** Total reserved amount for a (org, metric). */
  totalReserved(input: {
    orgId: string;
    metric: string;
    reservations: IOrgQuotaReservation[];
  }): number {
    return totalReserved(input);
  }

  /** Release a reservation. */
  async release(input: { id: string }): Promise<IOrgQuotaReservation> {
    const cur = await this.loadReservation(input.id);
    if (!cur) throw new Error('reservation not found');
    return releaseReservation({ reservation: cur });
  }

  /** Mark a reservation as consumed. */
  async consume(input: { id: string }): Promise<IOrgQuotaReservation> {
    const cur = await this.loadReservation(input.id);
    if (!cur) throw new Error('reservation not found');
    return consumeReservation({ reservation: cur });
  }

  /** Sweep expired reservations. */
  async sweep(input: { orgId: string; now?: string }) {
    const all = await this.listReservations(input.orgId);
    return sweepExpired({ reservations: all, ...(input.now ? { now: input.now } : {}) });
  }

  /** Decide whether a request fits given the reservations. */
  decide(input: {
    orgId: string;
    metric: string;
    envelope: number;
    committed: number;
    reservations: IOrgQuotaReservation[];
    requested: number;
  }): IReservationDecision {
    return decideReservation(input);
  }

  /** Whether the org can register another reservation. */
  canReserveMore(currentCount: number, opts?: IOrgQuotaReservationOptions): boolean {
    return canReserveMore(currentCount, opts);
  }

  /** Priority rules: whether new can evict existing. */
  canEvict(input: { existing: IOrgQuotaReservation; newPriority: ReservationPriority }): boolean {
    return canEvict(input);
  }

  /** Priority ranking — exposed for UI/admin. */
  rank(p: ReservationPriority): number {
    return priorityRank(p);
  }
}

function toReservation(row: Record<string, unknown>): IOrgQuotaReservation {
  return {
    id: String(row['id']),
    orgId: String(row['orgId']),
    baseId: String(row['baseId']),
    metric: String(row['metric']),
    amount: typeof row['amount'] === 'number' ? (row['amount'] as number) : 0,
    priority: String(row['priority']) as ReservationPriority,
    status: String(row['status']) as IOrgQuotaReservation['status'],
    expiresAt: new Date(String(row['expiresAt'] ?? Date.now())).toISOString(),
    consumed: Boolean(row['consumed']),
    reason: String(row['reason'] ?? ''),
    createdAt: new Date(String(row['createdAt'] ?? Date.now())).toISOString(),
    updatedAt: new Date(String(row['updatedAt'] ?? Date.now())).toISOString(),
  };
}
