/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Full-text search — NestJS module wiring (Round-INFRA-7).
 *
 * Imports the LicenseModule so the `admin_panel` capability guard can
 * resolve its service. The auth service owns all Prisma access; the
 * controller only parses query params and maps results.
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { FullTextSearchAuthService } from './full-text-search.auth.service';
import { FullTextSearchController } from './full-text-search.controller';

@Module({
  imports: [LicenseModule],
  controllers: [FullTextSearchController],
  providers: [FullTextSearchAuthService],
  exports: [FullTextSearchAuthService],
})
export class FullTextSearchModule {}
