import { Module } from '@nestjs/common';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { SmartsheetImportController } from './smartsheet-import.controller';
import { SmartsheetImportService } from './smartsheet-import.service';

/**
 * Round-21: Smartsheet import module — minimal driver mirroring the
 * baserow-import (R16) + clickup-import (R17) + jira-import (R18) +
 * monday-import (R19) + nocodb-import (R20) module pattern.
 *
 * Round-42: imports `RecordOpenApiModule` so the service can drive
 * `recordOpenApiV2Service.createRecords` for the full record-creation
 * path. Adds `listAllRows` + `importTable` to the service surface.
 */
@Module({
  imports: [RecordOpenApiModule],
  controllers: [SmartsheetImportController],
  providers: [SmartsheetImportService],
  exports: [SmartsheetImportService],
})
export class SmartsheetImportModule {}
