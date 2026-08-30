import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseKeySelfAdminGuard } from './license-key-self.admin.guard';
import { LicenseKeySelfAuthService } from './license-key-self.auth.service';

const previewSchema = z.object({
  request: z.object({
    licenseId: z.string().min(1),
    from: z.enum(['community', 'pro', 'business', 'enterprise']),
    to: z.enum(['community', 'pro', 'business', 'enterprise']),
    effectiveAt: z.string().datetime(),
    reason: z.string().max(500).optional(),
    actorId: z.string().optional(),
  }),
  cycleStart: z.string().datetime(),
  now: z.string().datetime(),
});

const cooldownSchema = z.object({
  licenseId: z.string().min(1),
  now: z.string().datetime(),
});

const applySchema = z.object({
  request: z.object({
    licenseId: z.string().min(1),
    from: z.enum(['community', 'pro', 'business', 'enterprise']),
    to: z.enum(['community', 'pro', 'business', 'enterprise']),
    effectiveAt: z.string().datetime(),
    reason: z.string().max(500).optional(),
    actorId: z.string().optional(),
  }),
  now: z.string().datetime(),
});

@Controller('api/admin/license')
@UseGuards(LicenseKeySelfAdminGuard)
@Permissions('instance|read')
export class LicenseKeySelfAdminController {
  constructor(private readonly service: LicenseKeySelfAuthService) {}

  @Post('preview')
  @Permissions('instance|update')
  preview(@Body(new ZodValidationPipe(previewSchema)) body: z.infer<typeof previewSchema>) {
    return this.service.preview({ ...body });
  }

  @Post('cooldown')
  cooldown(@Body(new ZodValidationPipe(cooldownSchema)) body: z.infer<typeof cooldownSchema>) {
    return this.service.cooldownFor({ ...body });
  }

  @Post('apply')
  @Permissions('instance|update')
  apply(@Body(new ZodValidationPipe(applySchema)) body: z.infer<typeof applySchema>) {
    return this.service.apply({ ...body });
  }
}
