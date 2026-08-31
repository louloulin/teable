/**
 * Custom AI Model — HTTP controller (Round-AI-2).
 *
 * Cloud 'AI Admin / 自定义 AI 模型' parity. Reuses the existing
 * `meta.byok_llm_key` table (no schema migration). All routes are
 * under `/api/custom-ai-model/*` and gated by `LicenseCapabilityGuard.for('byok_llm_key')`.
 *
 * License: AGPL-3.0
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { CustomAiModelAuthService } from './custom-ai-model.auth.service';

const CustomAiGuard = LicenseCapabilityGuard.for('byok_llm_key');

const providerEnum = z.enum([
  'custom-openai',
  'custom-anthropic',
  'custom-azure',
  'custom-ollama',
  'custom-bedrock',
]);

const isolationEnum = z.enum(['shared', 'per_base', 'per_user']);

const createSchema = z.object({
  orgId: z.string().trim().min(1).max(128),
  provider: providerEnum,
  alias: z.string().trim().min(1).max(128),
  baseUrl: z.string().trim().max(512).optional(),
  modelName: z.string().trim().min(1).max(128),
  apiKey: z.string().min(1).max(2048).optional(),
  isolation: isolationEnum.optional(),
});

const updateSchema = z.object({
  alias: z.string().trim().min(1).max(128).optional(),
  baseUrl: z.string().trim().max(512).optional(),
  modelName: z.string().trim().min(1).max(128).optional(),
  apiKey: z.string().min(1).max(2048).optional(),
  isolation: isolationEnum.optional(),
  status: z.enum(['active', 'disabled', 'pending_verification']).optional(),
});

type CreateBody = z.infer<typeof createSchema>;
type UpdateBody = z.infer<typeof updateSchema>;

@Controller('api/custom-ai-model')
@UseGuards(CustomAiGuard)
export class CustomAiModelController {
  constructor(
    private readonly auth: CustomAiModelAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  private requireUserId(): string {
    const userId = this.cls.get('user.id');
    if (!userId) throw new BadRequestException('user context missing');
    return userId;
  }

  /** List supported providers (Cloud 'Provider' dropdown). */
  @Get('providers')
  providers(): { providers: string[]; count: number } {
    return this.auth.listProviders();
  }

  /** List custom models for an org. */
  @Get('models')
  async listModels(@Query('orgId') orgId?: string): Promise<{
    orgId: string;
    models: Array<{
      id: string;
      provider: string;
      alias: string;
      modelName: string;
      status: string;
      isolation: string;
      createdAt: string;
    }>;
    count: number;
  }> {
    const effective = orgId ?? 'org_default';
    const models = await this.auth.listModels(effective);
    return {
      orgId: effective,
      models: models.map((m) => ({
        id: m.id,
        provider: m.provider,
        alias: m.alias,
        modelName: m.modelName,
        status: m.status,
        isolation: m.isolation,
        createdAt: m.createdAt,
      })),
      count: models.length,
    };
  }

  /** Get a single custom model by id. */
  @Get('models/:id')
  async getModel(
    @Param('id') id: string,
    @Query('orgId') orgId?: string
  ): Promise<{
    id: string;
    orgId: string;
    provider: string;
    alias: string;
    baseUrl?: string;
    modelName: string;
    status: string;
    isolation: string;
    createdAt: string;
    updatedAt: string;
  } | { model: null }> {
    const effective = orgId ?? 'org_default';
    const m = await this.auth.loadModel(effective, id);
    if (!m) return { model: null };
    return {
      id: m.id,
      orgId: m.orgId,
      provider: m.provider,
      alias: m.alias,
      baseUrl: m.baseUrl,
      modelName: m.modelName,
      status: m.status,
      isolation: m.isolation,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    };
  }

  /** Create a custom model. */
  @Post('models')
  async createModel(@Body(new ZodValidationPipe(createSchema)) body: CreateBody): Promise<{
    id: string;
    provider: string;
    alias: string;
    status: string;
    createdAt: string;
  }> {
    this.requireUserId();
    const m = await this.auth.createModel(body);
    return {
      id: m.id,
      provider: m.provider,
      alias: m.alias,
      status: m.status,
      createdAt: m.createdAt,
    };
  }

  /** Update a custom model. */
  @Patch('models/:id')
  async updateModel(
    @Param('id') id: string,
    @Query('orgId') orgId: string | undefined,
    @Body(new ZodValidationPipe(updateSchema)) body: UpdateBody
  ): Promise<{ id: string; alias: string; status: string; updatedAt: string } | { updated: false }> {
    this.requireUserId();
    const effective = orgId ?? 'org_default';
    const m = await this.auth.updateModel(effective, id, body);
    if (!m) return { updated: false };
    return { id: m.id, alias: m.alias, status: m.status, updatedAt: m.updatedAt };
  }

  /** Delete a custom model. */
  @Delete('models/:id')
  async deleteModel(
    @Param('id') id: string,
    @Query('orgId') orgId: string | undefined
  ): Promise<{ deleted: boolean }> {
    this.requireUserId();
    const effective = orgId ?? 'org_default';
    const ok = await this.auth.deleteModel(effective, id);
    return { deleted: ok };
  }

  /** Test connectivity to a custom model. */
  @Post('models/:id/test')
  async testModel(
    @Param('id') id: string,
    @Query('orgId') orgId: string | undefined
  ): Promise<{ ok: boolean; latencyMs?: number; message?: string; testedAt: string }> {
    const effective = orgId ?? 'org_default';
    return this.auth.testModel(effective, id);
  }

  /** Aggregate usage for an org's custom models. */
  @Get('usage')
  async usage(
    @Query('orgId') orgId?: string
  ): Promise<{
    orgId: string;
    totalRequests: number;
    totalTokens: number;
    byModel: Array<{ modelId: string; alias: string; requests: number; tokens: number }>;
  }> {
    const effective = orgId ?? 'org_default';
    return this.auth.usage(effective);
  }
}
