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
import { SettingModule } from '../setting/setting.module';
import { GoogleSheetsController } from './google-sheets.controller';
import { GoogleSheetsOAuthService } from './google-sheets-oauth.service';

@Module({
  imports: [PrismaModule, SettingModule],
  controllers: [GoogleSheetsController],
  providers: [GoogleSheetsOAuthService],
  exports: [GoogleSheetsOAuthService],
})
export class GoogleSheetsModule {}
