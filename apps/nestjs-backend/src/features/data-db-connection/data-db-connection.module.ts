/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Data DB connection — NestJS module wiring (Round-INFRA-5).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { DataDbConnectionController } from './data-db-connection.controller';
import { DataDbConnectionService } from './data-db-connection.service';

@Module({
  imports: [LicenseModule],
  controllers: [DataDbConnectionController],
  providers: [DataDbConnectionService],
  exports: [DataDbConnectionService],
})
export class DataDbConnectionModule {}
