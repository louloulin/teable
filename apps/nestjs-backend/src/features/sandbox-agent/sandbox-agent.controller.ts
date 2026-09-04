import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { ISandboxConfig } from '@teable/openapi';
import { sandboxConfigSchema } from '@teable/openapi';
import { z } from 'zod';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { SandboxAgentService } from './sandbox-agent.service';
import { LocalSandboxService } from './local-sandbox.service';

const SandboxAgentGuard = LicenseCapabilityGuard.for('sandbox_agent');
const idParamSchema = z.object({ id: z.string().min(1).max(200) });
const startLocalSandboxSchema = z.object({
  code: z.string().min(1).max(200_000),
  vcpus: z.number().int().min(1).max(16).optional(),
  memoryMb: z.number().int().min(64).max(8192).optional(),
  idleTimeoutSec: z.number().int().min(30).max(86400).optional(),
  streamIdleTimeoutSec: z.number().int().min(5).max(3600).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

@Controller('api/admin/sandbox-agent')
@UseGuards(SandboxAgentGuard)
@Permissions('instance|update')
export class SandboxAgentController {
  constructor(
    private readonly service: SandboxAgentService,
    private readonly localSandbox: LocalSandboxService
  ) {}

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
  // R-SANDBOX: real local sandbox runtime — start / list / stop.

  @Post('local/start')
  @Permissions('instance|update')
  async startLocalSandbox(
    @Body(new ZodValidationPipe(startLocalSandboxSchema))
    body: z.infer<typeof startLocalSandboxSchema>
  ) {
    const config = await this.service.getSettings();
    const actorId = (body.meta?.actorId as string) ?? 'admin';
    const { sessionId, session } = this.localSandbox.start(body, config, actorId);
    return { sessionId, session };
  }

  @Get('local/sessions')
  @Permissions('instance|read')
  listLocalSandbox() {
    return {
      active: this.localSandbox.activeCount(),
      sessions: this.localSandbox.listSessions(),
    };
  }

  @Get('local/sessions/:id')
  @Permissions('instance|read')
  getLocalSandbox(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    const session = this.localSandbox.getSession(params.id);
    if (!session) {
      return { error: 'session-not-found', sessionId: params.id };
    }
    return session;
  }

  @Delete('local/sessions/:id')
  async stopLocalSandbox(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }) {
    const ok = await this.localSandbox.stop(params.id, 'admin');
    return { ok, sessionId: params.id };
  }

}
