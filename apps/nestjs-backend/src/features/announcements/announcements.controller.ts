import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';
import type { IClsStore } from '../../types/cls';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AnnouncementsService } from './announcements.service';

const AnnouncementGuard = LicenseCapabilityGuard.for('announcements');
const idSchema = z.object({ id: z.string().min(1) });
const inputSchema = z.object({
  form: z.enum(['banner', 'toast', 'modal', 'sidebar-card']),
  level: z.enum(['info', 'maintenance', 'critical', 'resolved']),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  linkText: z.string().trim().max(200).optional(),
  linkUrl: z.string().url().max(2000).optional(),
  audience: z.enum(['everyone', 'spaces', 'users']),
  targetIds: z.array(z.string().trim().min(1)).max(1000).default([]),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

@Controller('api/admin/announcements')
@UseGuards(AnnouncementGuard)
@Permissions('instance|update')
export class AnnouncementsAdminController {
  constructor(
    private readonly service: AnnouncementsService,
    private readonly cls: ClsService<IClsStore>
  ) {}
  @Get()
  @Permissions('instance|read')
  list() {
    return this.service.list();
  }
  @Post()
  create(@Body(new ZodValidationPipe(inputSchema)) input: z.infer<typeof inputSchema>) {
    return this.service.create(input, this.cls.get('user.id') ?? 'system');
  }
  @Post(':id/withdraw')
  withdraw(@Param(new ZodValidationPipe(idSchema)) params: { id: string }) {
    return this.service.withdraw(params.id);
  }
}

@Controller('api/announcements')
@UseGuards(AnnouncementGuard)
export class AnnouncementsController {
  constructor(
    private readonly service: AnnouncementsService,
    private readonly cls: ClsService<IClsStore>
  ) {}
  @Get('active') active() {
    return this.service.activeForUser(this.cls.get('user.id') ?? '');
  }
  @Delete(':id/dismiss')
  dismiss(@Param(new ZodValidationPipe(idSchema)) params: { id: string }) {
    return this.service.dismiss(params.id, this.cls.get('user.id') ?? '');
  }
}
