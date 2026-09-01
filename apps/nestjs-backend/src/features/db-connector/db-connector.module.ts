/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * DB connector — NestJS module wiring (Round-INFRA-4).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { DbConnectorController } from './db-connector.controller';
import { DbConnectorAuthService } from './db-connector.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [DbConnectorController],
  providers: [DbConnectorAuthService],
  exports: [DbConnectorAuthService],
})
export class DbConnectorModule {}
