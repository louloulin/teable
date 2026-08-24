import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import { CustomHttpException } from '../../custom.exception';
import { HttpErrorCode } from '@teable/core';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import type { IClsStore } from '../../types/cls';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { CustomDomainService } from './custom-domain.service';

const CustomDomainGuard = LicenseCapabilityGuard.for('custom_domain');

const checkQuerySchema = z.object({
  domain: z.string().trim().min(1).max(253),
});

const claimBodySchema = z.object({
  domain: z.string().trim().min(1).max(253),
  organizationId: z.string().min(1),
});

interface ICheckQuery {
  domain: string;
}

interface IClaimBody {
  domain: string;
  organizationId: string;
}

/**
 * Admin endpoints backing the cloud custom-domain flow. The reverse-proxy
 * provisioning happens in the `teable-deployment` repo — this controller
 * only exposes the check / claim surface that operators and the UI call.
 */
@Controller('api/admin/custom-domain')
@UseGuards(CustomDomainGuard)
export class CustomDomainController {
  constructor(
    private readonly service: CustomDomainService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Get('check')
  check(@Query(new ZodValidationPipe(checkQuerySchema)) query: ICheckQuery) {
    return this.service.checkDomain(query.domain);
  }

  @Post('claim')
  @HttpCode(201)
  claim(@Body(new ZodValidationPipe(claimBodySchema)) body: IClaimBody) {
    const createdBy = this.requireUserId();
    return this.service.claimDomain(body.domain, body.organizationId, createdBy);
  }

  private requireUserId(): string {
    const userId = this.cls.get('user.id');
    if (!userId) {
      throw new CustomHttpException('user context missing', HttpErrorCode.FORBIDDEN);
    }
    return userId;
  }
}