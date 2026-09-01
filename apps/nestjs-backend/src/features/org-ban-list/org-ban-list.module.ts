/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Org ban list — NestJS module wiring (Round-INFRA-7).
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { OrgBanListAdminController } from './org-ban-list.controller';
import { OrgBanListAuthService } from './org-ban-list.auth.service';

@Module({
  imports: [LicenseModule],
  controllers: [OrgBanListAdminController],
  providers: [OrgBanListAuthService],
  exports: [OrgBanListAuthService],
})
export class OrgBanListModule {}
