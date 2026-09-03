/**
 * Google Sheets admin module — T-15 Wave 10.
 *
 * Exports `GoogleSheetsOAuthService` for the controller. Depends on
 * `SettingModule` for token storage and `PrismaModule` for the
 * `setting` delegate under the hood. No new npm deps — the OAuth
 * + Sheets REST calls go through plain `fetch`; encryption uses
 * Node `crypto`.
 */
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { SettingModule } from '../setting/setting.module';
import { GoogleSheetsImportService } from './google-sheets-import.service';
import { GoogleSheetsOAuthService } from './google-sheets-oauth.service';
import { GoogleSheetsController } from './google-sheets.controller';

@Module({
  imports: [PrismaModule, SettingModule, RecordOpenApiModule, LicenseModule],
  controllers: [GoogleSheetsController],
  providers: [GoogleSheetsOAuthService, GoogleSheetsImportService],
  exports: [GoogleSheetsOAuthService, GoogleSheetsImportService],
})
export class GoogleSheetsModule {}
