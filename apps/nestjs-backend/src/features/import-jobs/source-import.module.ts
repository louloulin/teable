/**
 * Unified source-import module (Cloud §migrations).
 *
 * Wires `SourceImportService`, `SourceImportProcessor`, the
 * `SourceImportController`, and every driver registered for the
 * `SOURCE_IMPORT_DRIVER` multi-provider token. Adding a new connector
 * (Notion, Airtable, Google Sheets, ...) is a single `useExisting`
 * line — the processor auto-discovers it on startup.
 */
import { Module } from '@nestjs/common';
import { AirtableImportModule } from '../airtable-import/airtable-import.module';
import { BaserowImportModule } from '../baserow-import/baserow-import.module';
import { GoogleSheetsModule } from '../google-sheets/google-sheets.module';
import { JiraImportModule } from '../jira-import/jira-import.module';
import { MondayImportModule } from '../monday-import/monday-import.module';
import { ClickUpImportModule } from '../clickup-import/clickup-import.module';
import { SmartSuiteImportModule } from '../smartsuite-import/smartsuite-import.module';
import { SmartsheetImportModule } from '../smartsheet-import/smartsheet-import.module';
import { LicenseModule } from '../license/license.module';
import { NotionModule } from '../notion/notion.module';
import { NocoDbImportModule } from '../nocodb-import/nocodb-import.module';
import { AirtableSourceDriver } from './airtable-source.driver';
import { GoogleSheetsSourceDriver } from './google-sheets-source.driver';
import { NocoDbSourceDriver } from './nocodb-source.driver';
import { BaserowSourceDriver } from './baserow-source.driver';
import { JiraSourceDriver } from './jira-source.driver';
import { MondaySourceDriver } from './monday-source.driver';
import { ClickUpSourceDriver } from './clickup-source.driver';
import { SmartSuiteSourceDriver } from './smartsuite-source.driver';
import { SmartsheetSourceDriver } from './smartsheet-source.driver';
import { NotionSourceDriver } from './notion-source.driver';
import { SOURCE_IMPORT_DRIVER } from './source-import.driver';
import { SourceImportCancellationService } from './source-import-cancellation.service';
import { SourceImportController } from './source-import.controller';
import { SourceImportProcessor } from './source-import.processor';
import { SOURCE_IMPORT_QUEUE, SourceImportService } from './source-import.service';
import { EventJobModule } from '../../event-emitter/event-job/event-job.module';

@Module({
  imports: [
    LicenseModule,
    NotionModule,
    AirtableImportModule,
    GoogleSheetsModule,
    NocoDbImportModule,
    BaserowImportModule,
    JiraImportModule,
    MondayImportModule,
    ClickUpImportModule,
    SmartSuiteImportModule,
    SmartsheetImportModule,
    EventJobModule.registerQueue(SOURCE_IMPORT_QUEUE),
  ],
  controllers: [SourceImportController],
  providers: [
    SourceImportService,
    SourceImportCancellationService,
    SourceImportProcessor,
    NotionSourceDriver,
    AirtableSourceDriver,
    GoogleSheetsSourceDriver,
    NocoDbSourceDriver,
    BaserowSourceDriver,
    JiraSourceDriver,
    MondaySourceDriver,
    ClickUpSourceDriver,
    SmartSuiteSourceDriver,
    SmartsheetSourceDriver,
    { provide: SOURCE_IMPORT_DRIVER, useExisting: NotionSourceDriver },
    { provide: SOURCE_IMPORT_DRIVER, useExisting: AirtableSourceDriver },
    { provide: SOURCE_IMPORT_DRIVER, useExisting: GoogleSheetsSourceDriver },
    { provide: SOURCE_IMPORT_DRIVER, useExisting: NocoDbSourceDriver },
    { provide: SOURCE_IMPORT_DRIVER, useExisting: BaserowSourceDriver },
    { provide: SOURCE_IMPORT_DRIVER, useExisting: JiraSourceDriver },
    { provide: SOURCE_IMPORT_DRIVER, useExisting: MondaySourceDriver },
    { provide: SOURCE_IMPORT_DRIVER, useExisting: ClickUpSourceDriver },
    { provide: SOURCE_IMPORT_DRIVER, useExisting: SmartSuiteSourceDriver },
    { provide: SOURCE_IMPORT_DRIVER, useExisting: SmartsheetSourceDriver },
  ],
  exports: [
    SourceImportService,
    SourceImportCancellationService,
    NotionSourceDriver,
    AirtableSourceDriver,
    GoogleSheetsSourceDriver,
    NocoDbSourceDriver,
    BaserowSourceDriver,
    JiraSourceDriver,
    MondaySourceDriver,
    ClickUpSourceDriver,
    SmartSuiteSourceDriver,
    SmartsheetSourceDriver,
  ],
})
export class SourceImportModule {}
