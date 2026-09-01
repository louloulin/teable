/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Risk control — admin HTTP controller (Round-INFRA-2).
 *
 * Read-only admin endpoints exposing the risk-control feature to the
 * admin panel:
 *   GET  /api/admin/risk-control/enabled
 *   GET  /api/admin/risk-control/check?type=signup&email=...
 *   POST /api/admin/risk-control/filter   { type, emails: string[] }
 *
 * All endpoints are gated by the `admin_panel` license capability.
 *
 * License: AGPL-3.0
 */
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import type { IRiskCheckType } from './risk-control.service';
import { RiskControlService } from './risk-control.service';

const RiskControlGuard = LicenseCapabilityGuard.for('admin_panel');

const checkQuerySchema = z.object({
  type: z.enum(['signup', 'invitation']),
  email: z.string().trim().min(1).max(320),
});

const filterBodySchema = z.object({
  type: z.enum(['signup', 'invitation']),
  emails: z.array(z.string().trim().min(1).max(320)).max(500),
});

@Controller('api/admin/risk-control')
@UseGuards(RiskControlGuard)
export class RiskControlController {
  constructor(private readonly svc: RiskControlService) {}

  @Get('enabled')
  async enabled(): Promise<{ enabled: boolean }> {
    return { enabled: this.svc.enabled };
  }

  @Get('check')
  async check(
    @Query(new ZodValidationPipe(checkQuerySchema)) q: z.infer<typeof checkQuerySchema>
  ): Promise<{ type: IRiskCheckType; email: string; denied: boolean }> {
    const denied = await this.svc.isEmailDenied(q.type, q.email);
    return { type: q.type, email: q.email, denied };
  }

  @Post('filter')
  async filter(
    @Body(new ZodValidationPipe(filterBodySchema)) body: z.infer<typeof filterBodySchema>
  ): Promise<{ type: IRiskCheckType; denied: string[] }> {
    const denied = await this.svc.filterDeniedEmails(body.type, body.emails);
    return { type: body.type, denied: Array.from(denied) };
  }
}
