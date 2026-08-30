import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  IDeleteTeamsConfigVo,
  IGetTeamsConfigVo,
  ISetTeamsConfigRo,
  ISetTeamsConfigVo,
  ITestTeamsMessageRo,
  ITestTeamsMessageVo,
} from '@teable/openapi';
import {
  deleteTeamsConfigVoSchema,
  getTeamsConfigVoSchema,
  setTeamsConfigRoSchema,
  testTeamsMessageRoSchema,
} from '@teable/openapi';
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { TeamsConfigService } from './teams-config.service';
import { TeamsAdapter } from './teams.adapter';

const TeamsBridgeGuard = LicenseCapabilityGuard.for('automation');

/**
 * Admin endpoints for Microsoft Teams configuration.
 *
 *   POST   /api/admin/im-bridge/teams/config        — store webhookUrl for a space
 *   GET    /api/admin/im-bridge/teams/config/:spaceId
 *   DELETE /api/admin/im-bridge/teams/config/:spaceId
 *   POST   /api/admin/im-bridge/teams/config/test   — fire a one-shot test message
 *
 * Gated by `instance|update` so only instance admins can mutate the
 * webhook URL; the GET is gated by `instance|read` so read-only admins
 * can still see what is configured.
 *
 * The "test" endpoint runs the live adapter against a webhook URL —
 * either the one supplied in the request body, or the configured
 * default for the space if omitted. It never persists anything.
 */
@Controller('api/admin/im-bridge/teams/config')
@UseGuards(TeamsBridgeGuard)
export class TeamsConfigController {
  private readonly logger = new Logger(TeamsConfigController.name);

  constructor(
    private readonly teamsConfig: TeamsConfigService,
    private readonly teamsAdapter: TeamsAdapter,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Post()
  @Permissions('instance|update')
  async setConfig(
    @Body(new ZodValidationPipe(setTeamsConfigRoSchema)) body: ISetTeamsConfigRo
  ): Promise<ISetTeamsConfigVo> {
    const validation = this.teamsAdapter.validateConfig({ webhookUrl: body.webhookUrl });
    if (!validation.ok) {
      throw new ForbiddenException(validation.error ?? 'invalid webhookUrl');
    }
    const userId = this.cls.get('user.id') ?? 'system';
    const saved = await this.teamsConfig.saveConfig(body.spaceId, body.webhookUrl, userId);
    return { ok: true, masked: saved.masked };
  }

  @Get(':spaceId')
  @Permissions('instance|read')
  async getConfig(@Param('spaceId') spaceId: string): Promise<IGetTeamsConfigVo> {
    return getTeamsConfigVoSchema.parse(await this.teamsConfig.getMaskedConfig(spaceId));
  }

  @Delete(':spaceId')
  @Permissions('instance|update')
  @HttpCode(200)
  async deleteConfig(@Param('spaceId') spaceId: string): Promise<IDeleteTeamsConfigVo> {
    const result = await this.teamsConfig.clearConfig(spaceId);
    return deleteTeamsConfigVoSchema.parse({ ok: true, deleted: result.deleted });
  }

  @Post('test')
  @Permissions('instance|update')
  async testMessage(
    @Body(new ZodValidationPipe(testTeamsMessageRoSchema)) body: ITestTeamsMessageRo
  ): Promise<ITestTeamsMessageVo> {
    const webhookUrl =
      body.webhookUrl ?? (await this.teamsConfig.getDecryptedWebhookUrl(body.spaceId));
    if (!webhookUrl) {
      throw new ForbiddenException(
        `no webhook URL provided and no default configured for space=${body.spaceId}`
      );
    }
    const result = await this.teamsAdapter.sendMessage(
      { webhookUrl },
      { text: body.text, title: body.title }
    );
    if (result.delivered) {
      return { ok: true, status: result.status };
    }
    this.logger.warn(`teams test failed: ${result.error}`);
    return { ok: false, error: result.error };
  }
}
