/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Cross-org admin grants — NestJS module wiring (Round-INFRA-5).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { CrossOrgAdminController } from './cross-org-admin.controller';
import { CrossOrgAdminService } from './cross-org-admin.service';

@Module({
  imports: [LicenseModule],
  controllers: [CrossOrgAdminController],
  providers: [CrossOrgAdminService],
  exports: [CrossOrgAdminService],
})
export class CrossOrgAdminModule {}
