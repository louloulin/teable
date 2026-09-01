/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Multi-region arbitration — NestJS module wiring (Round-INFRA-7).
 *
 * Imports the LicenseModule so the `admin_panel` capability guard can
 * resolve its service. The auth service is the single seam between the
 * admin controller and Prisma persistence.
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { MultiRegionArbitrationAuthService } from './multi-region-arbitration.auth.service';
import { MultiRegionArbitrationController } from './multi-region-arbitration.controller';

@Module({
  imports: [LicenseModule],
  controllers: [MultiRegionArbitrationController],
  providers: [MultiRegionArbitrationAuthService],
  exports: [MultiRegionArbitrationAuthService],
})
export class MultiRegionArbitrationModule {}
