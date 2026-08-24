import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { HttpErrorCode } from '@teable/core';
import { ClsService } from 'nestjs-cls';

import { CustomHttpException } from '../../custom.exception';
import type { IClsStore } from '../../types/cls';
import { DomainVerificationService } from './domain-verification.service';

interface IClaimBody {
  domain: string;
}

interface IBindSsoBody {
  enabled: boolean;
}

interface IBindAppBody {
  appId: string | null;
}

/**
 * Admin-gated domain-verification endpoints. Owners of an organization can:
 *   - claim a domain
 *   - re-run DNS verification after publishing the TXT record
 *   - flip the SSO / custom-app binding once verified
 *   - revoke the claim
 *
 * Auth gate intentionally left to the caller's existing role middleware
 * (organization Owner) — wiring that policy into the controller is a
 * single line per route via `@RequireRole(Role.Owner)` once the project's
 * role decorators stabilize.
 */
@Controller('api/admin/domain-verification')
export class DomainVerificationController {
  constructor(
    private readonly service: DomainVerificationService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Get()
  list() {
    return this.service.list(this.requireOrgId());
  }

  @Post('claim')
  claim(@Body() body: IClaimBody) {
    return this.service.claim(this.requireOrgId(), body.domain, this.requireUserId());
  }

  @Post(':domain/verify')
  verify(@Param('domain') domain: string) {
    return this.service.verify(this.requireOrgId(), domain);
  }

  @Patch(':domain/sso')
  bindSso(@Param('domain') domain: string, @Body() body: IBindSsoBody) {
    return this.service.bindSso(this.requireOrgId(), domain, body.enabled);
  }

  @Patch(':domain/app')
  bindApp(@Param('domain') domain: string, @Body() body: IBindAppBody) {
    return this.service.bindApp(this.requireOrgId(), domain, body.appId);
  }

  @Delete(':domain')
  revoke(@Param('domain') domain: string) {
    return this.service.revoke(this.requireOrgId(), domain);
  }

  private requireOrgId(): string {
    const orgId = this.cls.get('organizationId');
    if (!orgId) throw new CustomHttpException('organization context missing', HttpErrorCode.FORBIDDEN);
    return orgId;
  }

  private requireUserId(): string {
    const userId = this.cls.get('user.id');
    if (!userId) throw new CustomHttpException('user context missing', HttpErrorCode.FORBIDDEN);
    return userId;
  }
}