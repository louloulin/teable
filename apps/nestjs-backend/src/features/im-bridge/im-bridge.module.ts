import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';

import { FeishuAdapter } from './feishu.adapter';
import { FeishuConfigController } from './feishu-config.controller';
import { FeishuConfigService } from './feishu-config.service';
import { FeishuWebhookController } from './feishu-webhook.controller';
import { TeamsConfigController } from './teams-config.controller';
import { TeamsConfigService } from './teams-config.service';
import { TeamsAdapter } from './teams.adapter';

/**
 * IM bridge feature module.
 *
 * Owns:
 *   - `TeamsAdapter`        — Microsoft Teams Incoming Webhook adapter
 *   - `TeamsConfigService`  — per-space webhook URL storage (encrypted)
 *   - `TeamsConfigController`— admin REST endpoints
 *   - `FeishuAdapter`       — Feishu open-platform bot adapter (Stage V57)
 *   - `FeishuConfigService` — per-space encrypted App ID + App Secret
 *   - `FeishuConfigController` — admin REST endpoints
 *
 * Adapters are exported so `IMBridgeService` (automation module) can
 * dispatch messages through either target.
 */
@Module({
  imports: [PrismaModule, HttpModule, LicenseModule],
  controllers: [TeamsConfigController, FeishuConfigController, FeishuWebhookController],
  providers: [TeamsAdapter, TeamsConfigService, FeishuAdapter, FeishuConfigService],
  exports: [
    TeamsAdapter,
    TeamsConfigService,
    FeishuAdapter,
    FeishuConfigService,
  ],
})
export class ImBridgeModule {}
