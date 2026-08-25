/* eslint-disable @typescript-eslint/naming-convention */
/**
 * Seat metering — NestJS auth service (Stage 80).
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import {
  buildCycle,
  countsAsSeat,
  maxSeatsPerOrg,
  nextCycle,
  totalActiveSeats,
  validateAssignment,
} from './seat-metering.service';
import type { ISeatAssignment, ISeatCycle, SeatTier } from './seat-metering.types';

@Injectable()
export class SeatMeteringAuthService {
  constructor(private readonly prisma: PrismaService) {}

  /** Validate and create a new seat assignment. */
  async assignSeat(input: {
    id: string;
    orgId: string;
    actorId: string;
    tier: SeatTier;
    cycleAnchor: string;
    now: string;
  }): Promise<ISeatAssignment> {
    const assignment: ISeatAssignment = {
      id: input.id,
      orgId: input.orgId,
      actorId: input.actorId,
      tier: input.tier,
      status: 'pending',
      assignedAt: input.now,
      removedAt: null,
      cycleAnchor: input.cycleAnchor,
    };
    const err = validateAssignment(assignment);
    if (err) throw new Error(`invalid assignment: ${err}`);
    const current = await this.prisma.seatAssignment.count({ where: { orgId: input.orgId } });
    if (current >= maxSeatsPerOrg()) {
      throw new Error('seat cap reached');
    }
    await this.prisma.seatAssignment.create({
      data: {
        id: assignment.id,
        orgId: assignment.orgId,
        actorId: assignment.actorId,
        tier: assignment.tier,
        status: assignment.status,
        assignedAt: new Date(assignment.assignedAt),
        removedAt: null,
        cycleAnchor: new Date(assignment.cycleAnchor),
      },
    });
    return assignment;
  }

  /** Mark an assignment removed. */
  async deactivateSeat(input: { id: string; now: string }): Promise<ISeatAssignment | null> {
    const row = await this.prisma.seatAssignment.findUnique({ where: { id: input.id } });
    if (!row) return null;
    await this.prisma.seatAssignment.update({
      where: { id: input.id },
      data: { status: 'deactivated', removedAt: new Date(input.now) },
    });
    return this.rowToAssignment({
      ...row,
      status: 'deactivated',
      removedAt: new Date(input.now),
    });
  }

  /** Build a billing cycle for an org/tier. */
  async buildCycleForTier(input: {
    cycleId: string;
    orgId: string;
    tier: SeatTier;
    anchor: string;
  }): Promise<ISeatCycle> {
    const win = nextCycle({ anchor: input.anchor });
    const rows = await this.prisma.seatAssignment.findMany({
      where: { orgId: input.orgId, tier: input.tier },
    });
    const assignments = rows.map((r) => this.rowToAssignment(r));
    return buildCycle({
      id: input.cycleId,
      orgId: input.orgId,
      tier: input.tier,
      startedAt: win.startedAt,
      endedAt: win.endedAt,
      assignments,
      activeSeats: totalActiveSeats(assignments),
    });
  }

  /** Persist a cycle. */
  async persistCycle(cycle: ISeatCycle): Promise<void> {
    await this.prisma.seatCycle.create({
      data: {
        id: cycle.id,
        orgId: cycle.orgId,
        tier: cycle.tier,
        startedAt: new Date(cycle.startedAt),
        endedAt: new Date(cycle.endedAt),
        seatsActive: cycle.seatsActive,
        seatsProrated: cycle.seatsProrated,
        unitPriceCents: cycle.unitPriceCents,
        totalCents: cycle.totalCents,
      },
    });
  }

  /** Compute total active seats for an org. */
  async countActive(orgId: string): Promise<number> {
    const rows = await this.prisma.seatAssignment.findMany({ where: { orgId } });
    return totalActiveSeats(rows.map((r) => this.rowToAssignment(r)));
  }

  /** Whether a status counts toward seats. */
  countsAsSeat = countsAsSeat;

  private rowToAssignment(r: Record<string, unknown>): ISeatAssignment {
    return {
      id: String(r['id']),
      orgId: String(r['orgId']),
      actorId: String(r['actorId']),
      tier: r['tier'] as SeatTier,
      status: r['status'] as ISeatAssignment['status'],
      assignedAt: new Date(String(r['assignedAt'])).toISOString(),
      removedAt: r['removedAt'] ? new Date(String(r['removedAt'])).toISOString() : null,
      cycleAnchor: new Date(String(r['cycleAnchor'])).toISOString(),
    };
  }
}
