import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';

import { DataResidencyAuthService } from './data-residency.auth.service';
import type {
  IDataResidencyPolicy,
  IRegion,
  IResolvedRegionRoute,
  RegionStatus,
} from './data-residency.types';

/**
 * Round-29: Data residency HTTP controller.
 *
 * Exposes the existing DataResidencyAuthService (region + policy CRUD,
 * authorizeRequest) over HTTP. Without this controller, the capability
 * `data_residency_policy` is registered but unreachable — same "service
 * exists, no surface" gap that R28 fixed for approval-workflow.
 *
 * Routes (all under /api/data-residency):
 *   POST   /regions                       create region
 *   GET    /regions                       list regions
 *   GET    /regions/:code                 get region
 *   PATCH  /regions/:code                 update region status (drain/etc)
 *   PUT    /policies/:organizationId      upsert org policy (idempotent)
 *   GET    /policies/:organizationId      get org policy
 *   DELETE /policies/:organizationId      delete org policy
 *   POST   /authorize                     resolve route + reason for one request
 *
 * NOTE: @Public is a temporary stand-in so e2e + admin tools can exercise
 * the API without first setting up session auth; production deployment
 * should layer an `@UseGuards(AdminOnlyGuard)` (or similar) on top.
 */
@Public()
@Controller('api/data-residency')
export class DataResidencyController {
  constructor(private readonly auth: DataResidencyAuthService) {}

  // ---- Region CRUD ----

  @Post('regions')
  @HttpCode(200)
  async createRegion(
    @Body() body: { code: string; displayName: string; dataCenterLocation?: string }
  ): Promise<IRegion> {
    if (!body?.code || !body?.displayName) {
      throw new BadRequestException('code, displayName required');
    }
    return this.auth.createRegion(body);
  }

  @Get('regions')
  async listRegions(): Promise<{ regions: IRegion[] }> {
    return { regions: await this.auth.listRegions() };
  }

  @Get('regions/:code')
  async getRegion(@Param('code') code: string): Promise<IRegion> {
    const r = await this.auth.getRegion(code);
    if (!r) throw new BadRequestException(`region not found: ${code}`);
    return r;
  }

  @Patch('regions/:code')
  @HttpCode(200)
  async updateRegionStatus(
    @Param('code') code: string,
    @Body() body: { status: RegionStatus }
  ): Promise<IRegion> {
    if (!body?.status) {
      throw new BadRequestException('status required (active | draining | offline)');
    }
    return this.auth.updateRegionStatus(code, body.status);
  }

  // ---- Policy CRUD ----

  @Put('policies/:organizationId')
  @HttpCode(200)
  async setPolicy(
    @Param('organizationId') organizationId: string,
    @Body() body: { regionCode: string; locked: boolean; updatedBy: string }
  ): Promise<IDataResidencyPolicy> {
    if (!body?.regionCode || !body?.updatedBy) {
      throw new BadRequestException('regionCode, updatedBy required');
    }
    return this.auth.setPolicy({ organizationId, ...body });
  }

  @Get('policies/:organizationId')
  async getPolicy(
    @Param('organizationId') organizationId: string
  ): Promise<IDataResidencyPolicy | { policy: null }> {
    const p = await this.auth.getPolicy(organizationId);
    return p ?? { policy: null };
  }

  @Delete('policies/:organizationId')
  @HttpCode(200)
  async deletePolicy(
    @Param('organizationId') organizationId: string
  ): Promise<{ deleted: boolean }> {
    return { deleted: await this.auth.deletePolicy(organizationId) };
  }

  // ---- Authorize (read-only) ----

  @Post('authorize')
  @HttpCode(200)
  async authorizeRequest(
    @Body()
    body: {
      organizationId: string;
      requestRegion?: string;
    }
  ): Promise<IResolvedRegionRoute> {
    if (!body?.organizationId) {
      throw new BadRequestException('organizationId required');
    }
    // authorizeRequest() takes HTTP-style headers; map requestRegion into the
    // HEADER_REGION (x-teable-region) slot so callers don't need to know the
    // internal header name.
    const headers = body.requestRegion
      ? { 'x-teable-region': body.requestRegion }
      : null;
    return this.auth.authorizeRequest({
      organizationId: body.organizationId,
      headers,
    });
  }
}
