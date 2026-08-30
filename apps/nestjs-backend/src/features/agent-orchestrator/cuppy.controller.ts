import { randomUUID } from 'node:crypto';
import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';
import type { IClsStore } from '../../types/cls';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { PermissionService } from '../auth/permission.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { AgentOrchestratorService } from './agent-orchestrator.service';

const CuppyGuard = LicenseCapabilityGuard.for('cuppy_claw');
const cuppyChatSchema = z.object({
  baseId: z.string().trim().min(1).max(128).optional(),
  conversationId: z.string().trim().min(1).max(128).optional(),
  message: z.string().trim().min(1).max(10_000),
});
type CuppyChatBody = z.infer<typeof cuppyChatSchema>;

@Controller('api/cuppy')
@UseGuards(CuppyGuard)
export class CuppyController {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly cls: ClsService<IClsStore>,
    private readonly permissionService: PermissionService
  ) {}

  @Post('chat')
  async chat(
    @Body(new ZodValidationPipe(cuppyChatSchema)) body: CuppyChatBody
  ): Promise<{ conversationId: string; text: string }> {
    const userId = this.cls.get('user.id');
    if (!userId) throw new BadRequestException('user context missing');
    if (body.baseId) {
      await this.permissionService.validPermissions(
        body.baseId,
        ['base|read'],
        this.cls.get('accessTokenId')
      );
    }
    const conversationId = body.conversationId ?? randomUUID();
    const reply = await this.orchestrator.handle(conversationId, userId, {
      user_id: userId,
      text: body.message,
      provider_meta: { transport: 'http', ...(body.baseId ? { baseId: body.baseId } : {}) },
    });
    return { conversationId, text: reply.text };
  }
}
