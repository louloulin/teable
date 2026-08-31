/**
 * AI Admin Setting — HTTP controller (Round-AI-3).
 *
 * Routes (all under `/api/admin/ai-setting`, gated by admin token + 'ai' cap):
 *   GET   /                       full IAiSetting JSON
 *   PUT   /                       partial update (any field)
 *   POST  /enable                 flip enabled=true
 *   POST  /disable                flip enabled=false
 *   GET   /default-model          { defaultModel, defaultSmartLevel }
 *   PUT   /default-model          { model, smartLevel? }
 *   GET   /credit-policy          IAiCreditPolicy
 *   PUT   /credit-policy          partial IAiCreditPolicy
 *
 * Backed by `meta.setting` (name='ai_config') so the existing
 * `GET /api/admin/ai-settings` (admin-open-api) continues to return the same
 * payload — this module adds the write surface + structured access.
 *
 * License: AGPL-3.0
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AiSettingAuthService } from './ai-setting.auth.service';

const AiGuard = LicenseCapabilityGuard.for('ai');

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  defaultModel: z.string().trim().min(1).max(128).optional(),
  defaultSmartLevel: z.enum(['low', 'medium', 'high']).optional(),
  allowCustomModels: z.boolean().optional(),
  streamingEnabled: z.boolean().optional(),
  creditPolicy: z
    .object({
      perUserDailyCap: z.number().int().min(0).max(1_000_000_000).optional(),
      perOrgDailyCap: z.number().int().min(0).max(100_000_000_000).optional(),
      refundOnFailure: z.boolean().optional(),
    })
    .optional(),
});

const defaultModelSchema = z.object({
  model: z.string().trim().min(1).max(128),
  smartLevel: z.enum(['low', 'medium', 'high']).optional(),
});

const creditPolicySchema = z.object({
  perUserDailyCap: z.number().int().min(0).max(1_000_000_000).optional(),
  perOrgDailyCap: z.number().int().min(0).max(100_000_000_000).optional(),
  refundOnFailure: z.boolean().optional(),
});

type UpdateBody = z.infer<typeof updateSchema>;
type DefaultModelBody = z.infer<typeof defaultModelSchema>;
type CreditPolicyBody = z.infer<typeof creditPolicySchema>;

@Controller('api/admin/ai-setting')
@UseGuards(AiGuard)
export class AiSettingController {
  constructor(private readonly auth: AiSettingAuthService) {}

  @Get()
  async get(): Promise<unknown> {
    return this.auth.load();
  }

  @Put()
  async update(@Body(new ZodValidationPipe(updateSchema)) body: UpdateBody): Promise<unknown> {
    return this.auth.update(body);
  }

  @Post('enable')
  async enable(): Promise<{ enabled: boolean; updatedAt: string }> {
    const s = await this.auth.setEnabled(true);
    return { enabled: s.enabled, updatedAt: s.updatedAt };
  }

  @Post('disable')
  async disable(): Promise<{ enabled: boolean; updatedAt: string }> {
    const s = await this.auth.setEnabled(false);
    return { enabled: s.enabled, updatedAt: s.updatedAt };
  }

  @Get('default-model')
  async getDefaultModel(): Promise<{ defaultModel: string; defaultSmartLevel: string }> {
    const s = await this.auth.load();
    return { defaultModel: s.defaultModel, defaultSmartLevel: s.defaultSmartLevel };
  }

  @Put('default-model')
  async setDefaultModel(
    @Body(new ZodValidationPipe(defaultModelSchema)) body: DefaultModelBody
  ): Promise<{ defaultModel: string; defaultSmartLevel: string }> {
    const s = await this.auth.setDefaultModel(body.model, body.smartLevel);
    return { defaultModel: s.defaultModel, defaultSmartLevel: s.defaultSmartLevel };
  }

  @Get('credit-policy')
  async getCreditPolicy(): Promise<unknown> {
    const s = await this.auth.load();
    return s.creditPolicy;
  }

  @Put('credit-policy')
  async updateCreditPolicy(
    @Body(new ZodValidationPipe(creditPolicySchema)) body: CreditPolicyBody
  ): Promise<unknown> {
    return (await this.auth.updateCreditPolicy(body)).creditPolicy;
  }
}
