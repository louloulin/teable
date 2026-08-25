import { Body, Controller, Get, Headers, HttpCode, Param, Put } from '@nestjs/common';

import type { ISetSpaceQuotaInput } from './quota.types';
import { QuotaService } from './quota.service';

/**
 * REST surface for the quota subsystem.
 *
 * Routes:
 *   GET  /api/quota/:spaceId                  → usage report (owner / admin only)
 *   PUT  /api/quota/:spaceId                  → admin-only: replace plan + limits
 *                                                (license activation, plan upgrade)
 */
@Controller('api/quota')
export class QuotaController {
  constructor(private readonly quota: QuotaService) {}

  @Get(':spaceId')
  async getUsage(@Param('spaceId') spaceId: string) {
    return this.quota.getUsage(spaceId);
  }

  /**
   * Replace plan + limits for a space. Requires `x-admin-token` matching the
   * instance's `TEABLE_ADMIN_TOKEN`; mirrors the Cloud license-activation
   * path. Self-host operators wire their own auth in front of this endpoint.
   */
  @Put(':spaceId')
  @HttpCode(200)
  async setLimits(
    @Param('spaceId') spaceId: string,
    @Body() body: ISetSpaceQuotaInput,
    @Headers('x-admin-token') adminToken: string | undefined
  ) {
    if (!adminToken || adminToken !== process.env.TEABLE_ADMIN_TOKEN) {
      // Local import avoids a hard cycle on Permissions type.
      const { CustomHttpException } = await import('../../custom.exception');
      const { HttpErrorCode } = await import('@teable/core');
      throw new CustomHttpException('admin token required', HttpErrorCode.UNAUTHORIZED);
    }
    return this.quota.setPlanLimits(spaceId, body, 'admin');
  }
}
