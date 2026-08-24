import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { aiGenerateRoSchema, IAiGenerateRo } from '@teable/openapi';
import { Response } from 'express';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import {
  LicenseCapabilityGuard,
} from '../license/license-capability.guard';
import { TablePipe } from '../table/open-api/table.pipe';
import { AiService } from './ai.service';

const AiChatGuard = LicenseCapabilityGuard.for('ai_chat');

@Controller('api/:baseId/ai')
@UseGuards(AiChatGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('/generate-stream')
  @Permissions('base|read')
  async generateStream(
    @Param('baseId') baseId: string,
    @Body(new ZodValidationPipe(aiGenerateRoSchema), TablePipe) aiGenerateRo: IAiGenerateRo,
    @Res() res: Response
  ) {
    await this.aiService.generateStream(baseId, aiGenerateRo, res);
  }

  @Get('/config')
  @Permissions('base|read')
  async getAIConfig(@Param('baseId') baseId: string) {
    return await this.aiService.getSimplifiedAIConfig(baseId);
  }

  @Get('/disable-ai-actions')
  @Permissions('base|read')
  async getAIDisableAIActions(@Param('baseId') baseId: string) {
    return await this.aiService.getAIDisableAIActions(baseId);
  }
}
