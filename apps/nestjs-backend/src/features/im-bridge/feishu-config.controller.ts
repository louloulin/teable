/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Feishu config admin controller (Stage V57).
 *
 * Mirrors the Teams config surface so admins can wire a space's
 * Feishu self-built bot:
 *
 *   POST   /api/admin/im-bridge/feishu/config           upsert credentials
 *   GET    /api/admin/im-bridge/feishu/config/:spaceId   masked view
 *   DELETE /api/admin/im-bridge/feishu/config/:spaceId   clear credentials
 *   POST   /api/admin/im-bridge/feishu/config/test      one-shot message
 *
 * Gated by `automation` license capability (same as Teams) — only the
 * instance|update permission is required to mutate, instance|read to view.
 *
 * License: AGPL-3.0
 */
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
import { ClsService } from 'nestjs-cls';
import type { IClsStore } from '../../types/cls';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { FeishuAdapter } from './feishu.adapter';
import { FeishuConfigService } from './feishu-config.service';

const FeishuBridgeGuard = LicenseCapabilityGuard.for('automation');

interface IFeishuConfigBody {
  spaceId: string;
  appId: string;
  appSecret: string;
  receiveId: string;
  receiveIdType: 'chat_id' | 'open_id' | 'email' | 'union_id';
  verificationToken?: string;
  encryptKey?: string;
}

interface IFeishuTestBody {
  spaceId: string;
  text: string;
  title?: string;
  /** Override target — useful when the admin wants to test against a
   * different chat than the one stored in config. */
  receiveId?: string;
  receiveIdType?: 'chat_id' | 'open_id' | 'email' | 'union_id';
}

@Controller('api/admin/im-bridge/feishu/config')
@UseGuards(FeishuBridgeGuard)
export class FeishuConfigController {
  private readonly logger = new Logger(FeishuConfigController.name);

  constructor(
    private readonly feishuConfig: FeishuConfigService,
    private readonly feishuAdapter: FeishuAdapter,
    private readonly cls: ClsService<IClsStore>
  ) {}

  @Post()
  @Permissions('instance|update')
  async setConfig(@Body() body: IFeishuConfigBody) {
    if (!body?.spaceId) {
      throw new ForbiddenException('spaceId is required');
    }
    const validation = this.feishuAdapter.validateConfig({
      appId: body.appId,
      appSecret: body.appSecret,
      receiveId: body.receiveId,
      receiveIdType: body.receiveIdType,
      verificationToken: body.verificationToken,
      encryptKey: body.encryptKey,
    });
    if (!validation.ok) {
      throw new ForbiddenException(validation.error ?? 'invalid feishu config');
    }
    const userId = this.cls.get('user.id') ?? 'system';
    const saved = await this.feishuConfig.saveConfig(
      body.spaceId,
      {
        appId: body.appId,
        appSecret: body.appSecret,
        receiveId: body.receiveId,
        receiveIdType: body.receiveIdType,
        verificationToken: body.verificationToken,
        encryptKey: body.encryptKey,
      },
      userId
    );
    return saved;
  }

  @Get(':spaceId')
  @Permissions('instance|read')
  async getConfig(@Param('spaceId') spaceId: string) {
    return this.feishuConfig.getMaskedConfig(spaceId);
  }

  @Delete(':spaceId')
  @Permissions('instance|update')
  @HttpCode(200)
  async deleteConfig(@Param('spaceId') spaceId: string) {
    const r = await this.feishuConfig.clearConfig(spaceId);
    return { ok: true, deleted: r.deleted };
  }

  @Post('test')
  @Permissions('instance|update')
  @HttpCode(200)
  async testMessage(@Body() body: IFeishuTestBody) {
    if (!body?.spaceId) {
      throw new ForbiddenException('spaceId is required');
    }
    if (!body.text?.trim()) {
      throw new ForbiddenException('text is required');
    }
    const cfg = await this.feishuConfig.getDecryptedConfig(body.spaceId);
    if (!cfg) {
      throw new ForbiddenException(`no feishu config for space=${body.spaceId}`);
    }
    const result = await this.feishuAdapter.sendMessage(
      {
        appId: cfg.appId,
        appSecret: cfg.appSecret,
        receiveId: body.receiveId ?? cfg.receiveId,
        receiveIdType: body.receiveIdType ?? cfg.receiveIdType,
      },
      { text: body.text, title: body.title }
    );
    if (result.delivered) {
      return { ok: true, status: result.status };
    }
    this.logger.warn(`feishu test failed: ${result.error}`);
    return { ok: false, error: result.error };
  }
}
