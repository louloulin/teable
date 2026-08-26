import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { SettingModule } from '../setting/setting.module';
import { NotionController } from './notion.controller';
import { NotionImportService } from './notion-import.service';
import { NotionOAuthService } from './notion-oauth.service';

/**
 * Notion admin module.
 *
 * Wires the OAuth service, the import service, and the controller. The
 * `SettingModule` import gives us access to the persistent setting row that
 * stores the encrypted token envelope; `RecordOpenApiModule` exposes
 * `RecordService.createBatch()` (via the v2 open API surface) for the page →
 * record conversion; `LicenseModule` is required for the route-level
 * `LicenseCapabilityGuard` DI resolution.
 */
@Module({
  imports: [SettingModule, RecordOpenApiModule, LicenseModule],
  controllers: [NotionController],
  providers: [NotionOAuthService, NotionImportService],
  exports: [NotionOAuthService, NotionImportService],
})
export class NotionModule {}
