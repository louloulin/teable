/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Seat metering — admin HTTP controller (Round-INFRA-2).
 *
 * Read-only admin endpoints exposing per-org seat usage and cycle
 * breakdown:
 *   GET /api/admin/seat-metering/count?orgId=...
 *   GET /api/admin/seat-metering/cycle?orgId=...&tier=...&anchor=...
 *
 * All endpoints are gated by the `admin_panel` license capability.
 * Mutations (assignSeat, deactivateSeat, persistCycle) remain on the
 * auth service and are invoked from internal feature modules.
 *
 * License: AGPL-3.0
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { SeatMeteringAuthService } from './seat-metering.auth.service';
import type { ISeatCycle } from './seat-metering.types';
import { SEAT_TIERS } from './seat-metering.types';

const SeatMeteringGuard = LicenseCapabilityGuard.for('admin_panel');

const countQuerySchema = z.object({
  orgId: z.string().trim().min(1).max(100),
});

const cycleQuerySchema = z.object({
  orgId: z.string().trim().min(1).max(100),
  tier: z.enum(['starter', 'pro', 'enterprise']),
  anchor: z.string().trim().min(1).max(40),
});

@Controller('api/admin/seat-metering')
@UseGuards(SeatMeteringGuard)
export class SeatMeteringController {
  constructor(private readonly svc: SeatMeteringAuthService) {}

  @Get('count')
  async count(
    @Query(new ZodValidationPipe(countQuerySchema)) q: z.infer<typeof countQuerySchema>
  ): Promise<{ orgId: string; activeSeats: number }> {
    const active = await this.svc.countActive(q.orgId);
    return { orgId: q.orgId, activeSeats: active };
  }

  @Get('cycle')
  async cycle(
    @Query(new ZodValidationPipe(cycleQuerySchema)) q: z.infer<typeof cycleQuerySchema>
  ): Promise<ISeatCycle> {
    return this.svc.buildCycleForTier({
      cycleId: `${q.orgId}:${q.tier}:${q.anchor}`,
      orgId: q.orgId,
      tier: q.tier,
      anchor: q.anchor,
    });
  }

  @Get('tiers')
  async tiers(): Promise<{ tiers: ReadonlyArray<string> }> {
    return { tiers: SEAT_TIERS };
  }
}
