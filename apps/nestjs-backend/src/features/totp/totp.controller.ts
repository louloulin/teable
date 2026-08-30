import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';
import type { IClsStore } from '../../types/cls';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { TotpAuthService } from './totp.auth.service';

const beginEnrollmentSchema = z.object({
  label: z.string().trim().min(1).max(120),
});
const confirmEnrollmentSchema = z.object({
  factorId: z.string().min(1),
  secret: z.string().min(1),
  label: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/),
  backupCodes: z.array(z.string()).min(1),
  issuer: z.string().trim().min(1).max(120),
});
const verifySchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/),
  backupCode: z.string().optional(),
});
const idSchema = z.object({ id: z.string().min(1) });

@Controller('api/auth/totp')
export class TotpController {
  constructor(
    private readonly totp: TotpAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Get('status')
  async status() {
    const userId = this.cls.get('user.id');
    return { enabled: await this.totp.isEnabled(userId) };
  }

  @Post('enrollments')
  async beginEnrollment(
    @Body(new ZodValidationPipe(beginEnrollmentSchema)) body: z.infer<typeof beginEnrollmentSchema>
  ) {
    const userId = this.cls.get('user.id');
    return this.totp.beginEnrollment({ userId, label: body.label, issuer: 'Teable' });
  }

  @Post('enrollments/confirm')
  async confirmEnrollment(
    @Body(new ZodValidationPipe(confirmEnrollmentSchema))
    body: z.infer<typeof confirmEnrollmentSchema>
  ) {
    const userId = this.cls.get('user.id');
    return this.totp.confirmEnrollment({ userId, ...body });
  }

  @Post('verify')
  @HttpCode(200)
  async verify(@Body(new ZodValidationPipe(verifySchema)) body: z.infer<typeof verifySchema>) {
    const userId = this.cls.get('user.id');
    return this.totp.verify({ userId, code: body.code, backupCode: body.backupCode });
  }

  @Delete('factors/:id')
  async disable(@Param(new ZodValidationPipe(idSchema)) params: { id: string }) {
    const userId = this.cls.get('user.id');
    await this.totp.disable({ userId, factorId: params.id });
    return { ok: true, factorId: params.id };
  }
}
