/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Multi-region arbitration — admin HTTP controller (Round-INFRA-7).
 *
 * Read-only ops endpoints for the multi-region write arbitration fleet:
 *   GET /api/admin/multi-region-arbitration/regions
 *   GET /api/admin/multi-region-arbitration/regions/:regionId/health
 *   GET /api/admin/multi-region-arbitration/regions/:regionId/leases
 *   GET /api/admin/multi-region-arbitration/arbitration/status
 *   GET /api/admin/multi-region-arbitration/replay/queue
 *
 * All endpoints gated by the `admin_panel` license capability.
 * Lease issuance / conflict recording remain on the auth service and
 * are invoked from internal write paths.
 *
 * License: AGPL-3.0
 */
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { MultiRegionArbitrationAuthService } from './multi-region-arbitration.auth.service';
import type { IMultiRegionArbitrationOptions, IWriteRequest } from './multi-region-arbitration.types';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

const arbitrateSchema = z.object({
  request: z.object({
    resourceKey: z.string().trim().min(1).max(256),
    regionId: z.string().regex(/^[a-z]{2}-[a-z]+-\d+$/),
    holderId: z.string().trim().min(1).max(256),
    baseVersion: z.number().int().min(0),
    ttlMs: z.number().int().positive().max(60_000),
    now: z.string().datetime().optional(),
  }),
  options: z
    .object({
      defaultTtlMs: z.number().int().positive().max(60_000).optional(),
      maxTtlMs: z.number().int().positive().max(60_000).optional(),
      maxSkewMs: z.number().int().nonnegative().max(60_000).optional(),
      resolution: z.enum(['last-writer-wins', 'first-writer-wins', 'manual']).optional(),
      now: z.string().datetime().optional(),
    })
    .optional(),
});

type ArbitrateBody = z.infer<typeof arbitrateSchema>;

@Controller('api/admin/multi-region-arbitration')
@UseGuards(AdminGuard)
export class MultiRegionArbitrationController {
  constructor(private readonly svc: MultiRegionArbitrationAuthService) {}

  @Get('regions')
  async listRegions() {
    const regions = await this.svc.listRegions();
    return { total: regions.length, regions };
  }

  @Get('regions/:regionId/health')
  async regionHealth(@Param('regionId') regionId: string) {
    const regions = await this.svc.listRegions();
    const match = regions.find((r) => r.code === regionId || r.id === regionId);
    if (!match) throw new NotFoundException(`region not found: ${regionId}`);
    const health = await this.svc.regionHealth(match.code);
    return { ...match, ...health };
  }

  @Get('regions/:regionId/leases')
  async regionLeases(@Param('regionId') regionId: string) {
    const leases = await this.svc.listLeasesForRegion(regionId);
    return { regionId, total: leases.length, leases };
  }

  @Get('arbitration/status')
  async arbitrationStatus() {
    return this.svc.arbitrationStatus();
  }

  @Post('arbitrate')
  async arbitrate(@Body(new ZodValidationPipe(arbitrateSchema)) body: ArbitrateBody) {
    return this.svc.arbitrateAndPersist({
      request: body.request as IWriteRequest,
      ...(body.options ? { options: body.options as IMultiRegionArbitrationOptions } : {}),
    });
  }

  @Get('replay/queue')
  async replayQueue(@Query('now') nowIso?: string) {
    const at = nowIso ?? new Date().toISOString();
    const queue = await this.svc.readyReplays(at);
    return { sampledAt: at, ready: queue.length, entries: queue };
  }
}
