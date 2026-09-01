/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * App module wiring — NestJS module wiring (Round-INFRA-5).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { AppModuleWiringController } from './app-module-wiring.controller';
import { AppModuleWiringAuthService } from './app-module-wiring.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [AppModuleWiringController],
  providers: [AppModuleWiringAuthService],
  exports: [AppModuleWiringAuthService],
})
export class AppModuleWiringModule {}
