/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Login risk — NestJS module wiring (Stage 76).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { LoginRiskAdminController } from './login-risk.controller';
import { LoginRiskAuthService } from './login-risk.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [LoginRiskAdminController],
  providers: [LoginRiskAuthService],
  exports: [LoginRiskAuthService],
})
export class LoginRiskModule {}
