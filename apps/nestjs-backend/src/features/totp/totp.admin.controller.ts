import {
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';
import type { IClsStore } from '../../types/cls';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { TotpAuthService } from './totp.auth.service';

const idSchema = z.object({ id: z.string().min(1) });

/**
 * V10 — Admin TOTP management endpoints.
 *
 *   GET    /api/admin/totp/factors   list every factor across users
 *   DELETE /api/admin/totp/factors/:id revoke any user's factor
 *
 * Gates on `cls.user.isAdmin` instead of `isAdminOrLicense()` so the
 * capability matches the other `/api/admin/*` routes — admin session,
 * not license plan.
 */
@Controller('api/admin/totp')
export class TotpAdminController {
  constructor(
    private readonly totp: TotpAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  private assertAdmin() {
    const user = this.cls.get('user');
    if (!user?.isAdmin) {
      throw new ForbiddenException('admin session required');
    }
  }

  @Get('factors')
  async listFactors() {
    this.assertAdmin();
    return this.totp.adminListFactors();
  }

  @Delete('factors/:id')
  async disableFactor(@Param(new ZodValidationPipe(idSchema)) params: { id: string }) {
    this.assertAdmin();
    return this.totp.adminDisableFactor({ factorId: params.id });
  }
}
