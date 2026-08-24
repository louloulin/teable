import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import type { LicenseCapability } from '../license/license-capability.service';
import { AdminOpenApiService } from './admin-open-api.service';

/**
 * Stage 7 admin-panel read-only endpoints.
 *
 * Each route mounts `@UseGuards(LicenseCapabilityGuard.for('<cap>'))` at the
 * handler level (instead of class-level) so the gate is colocated with the
 * route it protects. This keeps the per-route capability decision obvious
 * from the controller source, and lets future additions reuse the same
 * controller without inheriting someone else's gate.
 *
 * Query validation is performed by `ZodValidationPipe` so the service layer
 * never has to defensively clamp `skip` / `take` / `search`.
 */

const PAGE_QUERY_BASE = {
  skip: z.coerce.number().int().min(0).optional().default(0),
  take: z.coerce.number().int().min(1).max(1000).optional().default(100),
};

const usersQuerySchema = z.object({
  ...PAGE_QUERY_BASE,
  search: z.string().trim().min(1).max(120).optional(),
});

const spacesQuerySchema = z.object({
  ...PAGE_QUERY_BASE,
});

const templatesQuerySchema = z.object({
  ...PAGE_QUERY_BASE,
});

const quotaDashboardQuerySchema = z.object({
  skip: z.coerce.number().int().min(0).optional().default(0),
  // quota-dashboard lists a denser stream, so the per-page ceiling is lower.
  take: z.coerce.number().int().min(1).max(500).optional().default(50),
});

type UsersQuery = z.infer<typeof usersQuerySchema>;
type SpacesQuery = z.infer<typeof spacesQuerySchema>;
type TemplatesQuery = z.infer<typeof templatesQuerySchema>;
type QuotaDashboardQuery = z.infer<typeof quotaDashboardQuerySchema>;

const guardFor = (cap: LicenseCapability) => LicenseCapabilityGuard.for(cap);

@Controller('api/admin')
export class AdminOpenApiController {
  constructor(private readonly adminService: AdminOpenApiService) {}

  @Get('users')
  @UseGuards(guardFor('users_read'))
  async listUsers(@Query(new ZodValidationPipe(usersQuerySchema)) query: UsersQuery) {
    return this.adminService.listUsers(query);
  }

  @Get('spaces')
  @UseGuards(guardFor('spaces_read'))
  async listSpaces(@Query(new ZodValidationPipe(spacesQuerySchema)) query: SpacesQuery) {
    return this.adminService.listSpaces(query);
  }

  @Get('templates')
  @UseGuards(guardFor('templates_read'))
  async listTemplates(
    @Query(new ZodValidationPipe(templatesQuerySchema)) query: TemplatesQuery
  ) {
    return this.adminService.listPublishedTemplates(query);
  }

  @Get('ai-settings')
  @UseGuards(guardFor('ai'))
  async aiSettings() {
    return this.adminService.getAiSettings();
  }

  @Get('quota-dashboard')
  @UseGuards(guardFor('quota_view'))
  async quotaDashboard(
    @Query(new ZodValidationPipe(quotaDashboardQuerySchema)) query: QuotaDashboardQuery
  ) {
    return this.adminService.getQuotaDashboard(query);
  }
}