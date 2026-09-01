/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Federated SSO — NestJS module wiring (Stage 60).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { FederatedSsoAdminController } from './federated-sso.controller';
import { FederatedSsoAuthService } from './federated-sso.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [FederatedSsoAdminController],
  providers: [FederatedSsoAuthService],
  exports: [FederatedSsoAuthService],
})
export class FederatedSsoModule {}
