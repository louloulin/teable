import { Body, Controller, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';

import type { IClsStore } from '../../types/cls';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AiBuilderAuthService } from './ai-builder.auth.service';
import { MAX_PROMPT_LENGTH } from './ai-builder.service';
import type { IBuilderProposalRow } from './ai-builder.types';

const AiBuilderGuard = LicenseCapabilityGuard.for('ai_app_builder');

const createSchema = z.object({
  sourcePrompt: z.string().trim().min(3).max(MAX_PROMPT_LENGTH),
});
const rejectSchema = z.object({ reason: z.string().trim().max(500).optional().default('') });
const applySchema = z.object({ resourceId: z.string().trim().min(1).max(128).optional() });

type ICreateBody = z.infer<typeof createSchema>;
type IRejectBody = z.infer<typeof rejectSchema>;
type IApplyBody = z.infer<typeof applySchema>;

@Controller('api/:baseId/ai-builder')
@UseGuards(AiBuilderGuard)
export class AiBuilderController {
  constructor(
    private readonly auth: AiBuilderAuthService,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Post('proposals')
  @Permissions('base|update')
  create(
    @Param('baseId') baseId: string,
    @Body(new ZodValidationPipe(createSchema)) body: ICreateBody
  ): Promise<IBuilderProposalRow> {
    return this.auth.createProposal({
      baseId,
      sourcePrompt: body.sourcePrompt,
      createdBy: this.currentUserId(),
    });
  }

  @Get('proposals')
  @Permissions('base|read')
  list(@Param('baseId') baseId: string): Promise<IBuilderProposalRow[]> {
    return this.auth.listProposals(baseId);
  }

  @Get('proposals/:proposalId')
  @Permissions('base|read')
  async get(
    @Param('baseId') baseId: string,
    @Param('proposalId') proposalId: string
  ): Promise<IBuilderProposalRow> {
    const proposal = await this.auth.getProposal(proposalId, baseId);
    if (!proposal) throw new NotFoundException(`proposal not found: ${proposalId}`);
    return proposal;
  }

  @Post('proposals/:proposalId/approve')
  @Permissions('base|update')
  approve(
    @Param('baseId') baseId: string,
    @Param('proposalId') proposalId: string
  ): Promise<IBuilderProposalRow> {
    return this.auth.approve({
      baseId,
      proposalId,
      approvedBy: this.currentUserId(),
    });
  }

  @Post('proposals/:proposalId/reject')
  @Permissions('base|update')
  reject(
    @Param('baseId') baseId: string,
    @Param('proposalId') proposalId: string,
    @Body(new ZodValidationPipe(rejectSchema)) body: IRejectBody
  ): Promise<IBuilderProposalRow> {
    return this.auth.reject(proposalId, body.reason, baseId);
  }

  @Post('proposals/:proposalId/apply')
  @Permissions('base|update')
  apply(
    @Param('baseId') baseId: string,
    @Param('proposalId') proposalId: string,
    @Body(new ZodValidationPipe(applySchema)) body: IApplyBody
  ): Promise<IBuilderProposalRow> {
    return this.auth.markApplied(proposalId, body.resourceId, baseId);
  }

  private currentUserId(): string {
    const userId = this.cls.get('user.id');
    if (!userId) throw new NotFoundException('user context missing');
    return userId;
  }
}
