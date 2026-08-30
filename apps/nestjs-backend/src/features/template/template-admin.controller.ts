/**
 * Template admin surface — bridges the existing TemplateOpenApiController at
 * /api/template into the admin namespace at /api/admin/template so the
 * AdminLayout sidebar entry resolves without an XHR redirect.
 *
 * Both controllers delegate to the same `TemplateService`, so writes made
 * via either path show up identically.
 */
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { TemplateOpenApiService as TemplateService } from './template-open-api.service';

const TemplateAdminGuard = LicenseCapabilityGuard.for('admin_panel');

const listSchema = z.object({
  category: z.string().optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(200).default(100),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  baseId: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
  published: z.boolean().optional(),
});

@Controller('api/admin/template')
@UseGuards(TemplateAdminGuard)
export class TemplateAdminController {
  constructor(private readonly service: TemplateService) {}

  @Get()
  @Permissions('instance|read')
  list(@Query(new ZodValidationPipe(listSchema)) q: z.infer<typeof listSchema>) {
    return this.service.getAllTemplateList(q);
  }

  @Get('published')
  @Permissions('instance|read')
  published(@Query(new ZodValidationPipe(listSchema)) q: z.infer<typeof listSchema>) {
    return this.service.getPublishedTemplateList(q);
  }

  @Post()
  @Permissions('instance|update')
  create(@Body(new ZodValidationPipe(createSchema)) body: z.infer<typeof createSchema>) {
    return this.service.createTemplate(body);
  }

  @Patch(':templateId')
  @Permissions('instance|update')
  update(
    @Param('templateId') templateId: string,
    @Body(new ZodValidationPipe(updateSchema)) body: z.infer<typeof updateSchema>
  ) {
    return this.service.updateTemplate(templateId, body);
  }

  @Delete(':templateId')
  @Permissions('instance|update')
  remove(@Param('templateId') templateId: string) {
    return this.service.deleteTemplate(templateId);
  }

}
