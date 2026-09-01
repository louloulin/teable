/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Login risk — admin HTTP controller (Stage 76).
 *
 *   GET /api/admin/login-risk/score-by-email?email=...&ip=...
 *   GET /api/admin/login-risk/score-by-ip?actorId=...&ip=...
 *
 * Lets the admin panel probe a candidate login attempt's risk band
 * without replaying it through the auth surface. Both routes are
 * read-only: they never persist state.
 *
 * License: AGPL-3.0
 */
import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { LoginRiskAuthService } from './login-risk.auth.service';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/login-risk')
@UseGuards(AdminGuard)
export class LoginRiskAdminController {
  constructor(private readonly svc: LoginRiskAuthService) {}

  @Get('score-by-email')
  scoreByEmail(@Query('email') email: string, @Query('ip') ip: string) {
    if (!email || !ip) throw new BadRequestException('email and ip are required');
    return this.svc.scoreFor({
      actorId: `email:${email.toLowerCase()}`,
      email,
      ip,
    });
  }

  @Get('score-by-ip')
  scoreByIp(@Query('actorId') actorId: string, @Query('ip') ip: string) {
    if (!actorId || !ip) throw new BadRequestException('actorId and ip are required');
    return this.svc.scoreFor({ actorId, ip });
  }
}
