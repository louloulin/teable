import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';
import type { IClsStore } from '../../types/cls';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import type { LicenseCapability } from '../license/license-capability.service';
import { AdminOpenApiService } from './admin-open-api.service';
import { AdminTableQueryOpsService } from './admin-table-query-ops.service';

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

const tableQueryOpsQuerySchema = z.object({
  spaceId: z.string().trim().min(1).max(100).optional(),
  baseId: z.string().trim().min(1).max(100).optional(),
  tableId: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
});
const tableQueryOpsRecommendationParamSchema = z.object({ id: z.string().trim().min(1).max(100) });
const tableQueryOpsRecommendationBodySchema = z.object({
  baseId: z.string().trim().min(1).max(100),
  kind: z
    .enum([
      'create_search_index',
      'create_search_vector',
      'rebuild_search_vector',
      'create_filter_index',
      'create_sort_index',
      'repair_index',
      'manual_investigation',
    ])
    .optional(),
});
const tableQueryOpsTaskBodySchema = z.object({
  baseId: z.string().trim().min(1).max(100),
  allowManualIndexExecution: z.boolean().optional().default(false),
});
const aiGenerationTasksQuerySchema = z.object({
  status: z.enum(['waiting', 'processing', 'completed', 'failed', 'canceled']).optional(),
  spaceId: z.string().trim().min(1).max(100).optional(),
  take: z.coerce.number().int().min(1).max(1000).optional().default(100),
});
const aiGenerationTaskParamSchema = z.object({ id: z.string().trim().min(1).max(100) });

const userIdParamSchema = z.object({ id: z.string().min(1).max(100) });
const spaceIdParamSchema = z.object({ id: z.string().min(1).max(100) });
const updateSpaceSchema = z
  .object({ name: z.string().trim().min(1).max(100).optional(), autoJoin: z.boolean().optional() })
  .refine((value) => value.name !== undefined || value.autoJoin !== undefined, {
    message: 'At least one space property is required',
  });
const updateUserSchema = z
  .object({
    active: z.boolean().optional(),
    isAdmin: z.boolean().optional(),
  })
  .refine((value) => value.active !== undefined || value.isAdmin !== undefined, {
    message: 'At least one user property is required',
  });
const deleteUserSchema = z.object({ confirm: z.literal('DELETE') });

type UsersQuery = z.infer<typeof usersQuerySchema>;
type SpacesQuery = z.infer<typeof spacesQuerySchema>;
type TemplatesQuery = z.infer<typeof templatesQuerySchema>;
type QuotaDashboardQuery = z.infer<typeof quotaDashboardQuerySchema>;
type TableQueryOpsQuery = z.infer<typeof tableQueryOpsQuerySchema>;
type TableQueryOpsRecommendationBody = z.infer<typeof tableQueryOpsRecommendationBodySchema>;
type TableQueryOpsTaskBody = z.infer<typeof tableQueryOpsTaskBodySchema>;
type AiGenerationTasksQuery = z.infer<typeof aiGenerationTasksQuerySchema>;
type UpdateUserInput = z.infer<typeof updateUserSchema>;
type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>;

const guardFor = (cap: LicenseCapability) => LicenseCapabilityGuard.for(cap);

@Controller('api/admin')
export class AdminOpenApiController {
  constructor(
    private readonly adminService: AdminOpenApiService,
    private readonly tableQueryOpsService: AdminTableQueryOpsService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Get('users')
  @UseGuards(guardFor('users_read'))
  async listUsers(@Query(new ZodValidationPipe(usersQuerySchema)) query: UsersQuery) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id')
  @UseGuards(guardFor('admin_panel'))
  @Permissions('instance|update')
  async updateUser(
    @Param(new ZodValidationPipe(userIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateUserSchema)) input: UpdateUserInput
  ) {
    return this.adminService.updateUser({
      userId: params.id,
      requesterId: this.cls.get('user.id'),
      ...input,
    });
  }

  @Post('users/:id/restore')
  @UseGuards(guardFor('admin_panel'))
  @Permissions('instance|update')
  async restoreUser(@Param(new ZodValidationPipe(userIdParamSchema)) params: { id: string }) {
    return this.adminService.restoreUser({
      userId: params.id,
      requesterId: this.cls.get('user.id'),
    });
  }

  @Delete('users/:id')
  @UseGuards(guardFor('admin_panel'))
  @Permissions('instance|update')
  async deleteUser(
    @Param(new ZodValidationPipe(userIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(deleteUserSchema)) input: { confirm: 'DELETE' }
  ) {
    return this.adminService.deleteUser({
      userId: params.id,
      requesterId: this.cls.get('user.id'),
      confirm: input.confirm,
    });
  }

  @Delete('users/:id/permanent')
  @UseGuards(guardFor('admin_panel'))
  @Permissions('instance|update')
  async permanentlyDeleteUser(
    @Param(new ZodValidationPipe(userIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(deleteUserSchema)) input: { confirm: 'DELETE' }
  ) {
    return this.adminService.permanentlyDeleteUser({
      userId: params.id,
      requesterId: this.cls.get('user.id'),
      confirm: input.confirm,
    });
  }

  @Get('spaces')
  @UseGuards(guardFor('spaces_read'))
  async listSpaces(@Query(new ZodValidationPipe(spacesQuerySchema)) query: SpacesQuery) {
    return this.adminService.listSpaces(query);
  }

  @Patch('spaces/:id')
  @UseGuards(guardFor('admin_panel'))
  @Permissions('instance|update')
  async updateSpace(
    @Param(new ZodValidationPipe(spaceIdParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateSpaceSchema)) input: UpdateSpaceInput
  ) {
    return this.adminService.updateSpace({
      spaceId: params.id,
      name: input.name,
      autoJoin: input.autoJoin,
    });
  }

  @Delete('spaces/:id')
  @UseGuards(guardFor('admin_panel'))
  @Permissions('instance|update')
  async deleteSpace(@Param(new ZodValidationPipe(spaceIdParamSchema)) params: { id: string }) {
    return this.adminService.deleteSpace(params.id);
  }

  @Get('templates')
  @UseGuards(guardFor('templates_read'))
  async listTemplates(@Query(new ZodValidationPipe(templatesQuerySchema)) query: TemplatesQuery) {
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

  @Get('table-query-ops/overview')
  @UseGuards(guardFor('table_query_ops'))
  async tableQueryOpsOverview(
    @Query(new ZodValidationPipe(tableQueryOpsQuerySchema)) query: TableQueryOpsQuery
  ) {
    return this.adminService.getTableQueryOpsOverview(query);
  }

  @Post('table-query-ops/recommendations/:id/accept')
  @UseGuards(guardFor('table_query_ops'))
  @Permissions('instance|update')
  async acceptTableQueryOpsRecommendation(
    @Param(new ZodValidationPipe(tableQueryOpsRecommendationParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(tableQueryOpsRecommendationBodySchema))
    input: TableQueryOpsRecommendationBody
  ) {
    return this.tableQueryOpsService.acceptRecommendation({
      recommendationId: params.id,
      ...input,
    });
  }

  @Post('table-query-ops/recommendations/:id/dismiss')
  @UseGuards(guardFor('table_query_ops'))
  @Permissions('instance|update')
  async dismissTableQueryOpsRecommendation(
    @Param(new ZodValidationPipe(tableQueryOpsRecommendationParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(tableQueryOpsRecommendationBodySchema))
    input: TableQueryOpsRecommendationBody
  ) {
    return this.tableQueryOpsService.dismissRecommendation({
      recommendationId: params.id,
      baseId: input.baseId,
    });
  }

  @Post('table-query-ops/tasks/:id/run')
  @UseGuards(guardFor('table_query_ops'))
  @Permissions('instance|update')
  async runTableQueryOpsTask(
    @Param(new ZodValidationPipe(tableQueryOpsRecommendationParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(tableQueryOpsTaskBodySchema)) input: TableQueryOpsTaskBody
  ) {
    return this.tableQueryOpsService.runTask({ taskId: params.id, ...input });
  }

  @Get('ai-generation-queue/overview')
  @UseGuards(guardFor('ai'))
  @Permissions('instance|read')
  async aiGenerationQueueOverview() {
    return this.adminService.getAiGenerationQueueOverview();
  }

  @Get('ai-generation-queue/tasks')
  @UseGuards(guardFor('ai'))
  @Permissions('instance|read')
  async aiGenerationQueueTasks(
    @Query(new ZodValidationPipe(aiGenerationTasksQuerySchema)) query: AiGenerationTasksQuery
  ) {
    return this.adminService.listAiGenerationTasks(query);
  }

  @Post('ai-generation-queue/tasks/:id/cancel')
  @UseGuards(guardFor('ai'))
  @Permissions('instance|update')
  async cancelAiGenerationQueueTask(
    @Param(new ZodValidationPipe(aiGenerationTaskParamSchema)) params: { id: string }
  ) {
    return this.adminService.cancelAiGenerationTask(params.id);
  }
}
