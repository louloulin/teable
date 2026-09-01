/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Canary — admin HTTP controller (Round-INFRA-7).
 *
 * Operator-facing endpoints for the V2 canary release pipeline:
 *   GET  /api/admin/canary/deployments
 *   GET  /api/admin/canary/status
 *   POST /api/admin/canary/start
 *   POST /api/admin/canary/rollback
 *
 * `start` accepts { spaceIds: string[], forceV2All?: boolean } and persists
 * the new canary config. `rollback` clears the config so subsequent reads
 * see `enabled: false`. All endpoints gated by `admin_panel` capability.
 *
 * License: AGPL-3.0
 */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { CanaryService } from './canary.service';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

const startSchema = z.object({
  spaceIds: z.array(z.string().trim().min(1).max(100)).min(1).max(1000),
  forceV2All: z.boolean().optional(),
});

type StartBody = z.infer<typeof startSchema>;

@Controller('api/admin/canary')
@UseGuards(AdminGuard)
export class CanaryController {
  constructor(private readonly svc: CanaryService) {}

  @Get('deployments')
  async deployments() {
    const config = await this.svc.getCanaryConfig();
    return {
      config,
      featureEnabled: this.svc.isCanaryFeatureEnabled(),
      forceV2AllEnv: this.svc.isForceV2AllEnabled(),
    };
  }

  @Get('status')
  async status() {
    const config = await this.svc.getCanaryConfig();
    const active = !!config?.enabled && (config?.spaceIds?.length ?? 0) > 0;
    return {
      active,
      enabled: config?.enabled ?? false,
      spaceCount: config?.spaceIds?.length ?? 0,
      forceV2All: config?.forceV2All ?? false,
      featureEnabled: this.svc.isCanaryFeatureEnabled(),
      forceV2AllEnv: this.svc.isForceV2AllEnabled(),
    };
  }

  @Post('start')
  async start(@Body() body: unknown) {
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const data: StartBody = parsed.data;
    const next = await this.svc.startCanary({
      spaceIds: data.spaceIds,
      ...(data.forceV2All !== undefined ? { forceV2All: data.forceV2All } : {}),
    });
    return { ok: true, config: next };
  }

  @Post('rollback')
  async rollback() {
    const next = await this.svc.rollbackCanary();
    return { ok: true, config: next };
  }
}
