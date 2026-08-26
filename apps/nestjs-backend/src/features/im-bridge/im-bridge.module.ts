import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { TeamsConfigController } from './teams-config.controller';
import { TeamsConfigService } from './teams-config.service';
import { TeamsAdapter } from './teams.adapter';

/**
 * IM bridge feature module.
 *
 * Owns:
 *   - `TeamsAdapter` — Microsoft Teams Incoming Webhook adapter (transport-agnostic)
 *   - `TeamsConfigService` — per-space webhook URL storage (encrypted at rest)
 *   - `TeamsConfigController` — admin REST endpoints
 *
 * The module is deliberately scoped to Teams only — Slack/Discord/Telegram
 * are still dispatched by `IMBridgeService` in the automation module
 * (existing Stage 15 contract). This keeps the change additive and lets
 * the upstream `IMBridgeService` core body stay untouched.
 */
@Module({
  imports: [PrismaModule, HttpModule],
  controllers: [TeamsConfigController],
  providers: [TeamsAdapter, TeamsConfigService],
  exports: [TeamsAdapter, TeamsConfigService],
})
export class ImBridgeModule {}
