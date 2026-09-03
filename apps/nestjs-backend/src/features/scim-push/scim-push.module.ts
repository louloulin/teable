/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * SCIM Push NestJS module (Stage 67).
 *
 * Wires the admin-only controller for outbound SCIM push subscriptions
 * (IdP ← instance) to the existing ScimPushAuthService. Independent of
 * ScimModule so it can run even when inbound SCIM is disabled.
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { ScimPushController } from './scim-push.controller';
import { ScimPushAuthService } from './scim-push.auth.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [ScimPushController],
  providers: [ScimPushAuthService],
  exports: [ScimPushAuthService],
})
export class ScimPushModule {}
