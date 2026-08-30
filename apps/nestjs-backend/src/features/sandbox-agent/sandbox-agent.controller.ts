import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { ISandboxConfig } from '@teable/openapi';
import { sandboxConfigSchema } from '@teable/openapi';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { SandboxAgentService } from './sandbox-agent.service';

const SandboxAgentGuard = LicenseCapabilityGuard.for('sandbox_agent');
const idParamSchema = z.object({ id: z.string().min(1).max(200) });

@Controller('api/admin/sandbox-agent')
@UseGuards(SandboxAgentGuard)
@Permissions('instance|update')
export class SandboxAgentController {
  constructor(private readonly service: SandboxAgentService) {}

  @Get('config')
  @Permissions('instance|read')
  async config() {
    const [settings, runtime] = await Promise.all([
      this.service.getSettings(),
      Promise.resolve(this.service.getRuntimeStatus()),
    ]);
    return { settings, runtime };
  }

  @Patch('config')
  async updateConfig(
    @Body(new ZodValidationPipe(sandboxConfigSchema.partial())) input: Partial<ISandboxConfig>
  ) {
    const [settings, runtime] = await Promise.all([
      this.service.updateSettings(input),
      Promise.resolve(this.service.getRuntimeStatus()),
    ]);
    return { settings, runtime };
  }

  @Get('sessions')
  @Permissions('instance|read')
  listSessions() {
    return this.service.listSessions();
  }

  @Delete('sessions/:id')
  terminateSession(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    return this.service.terminateSession(params.id);
  }
}
