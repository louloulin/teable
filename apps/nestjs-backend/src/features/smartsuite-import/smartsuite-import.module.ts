import { Module } from '@nestjs/common';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { SmartSuiteImportController } from './smartsuite-import.controller';
import { SmartSuiteImportService } from './smartsuite-import.service';

/**
 * Round-22: SmartSuite import module — minimal driver mirroring the
 * baserow-import (R16) + clickup-import (R17) + jira-import (R18) +
 * monday-import (R19) + nocodb-import (R20) + smartsheet-import (R21)
 * module pattern.
 *
 * Round-41: imports `RecordOpenApiModule` so the service can drive
 * `recordOpenApiV2Service.createRecords` for the full record-creation
 * path. Adds `listAllRecords` + `importTable` to the service surface.
 */
@Module({
  imports: [RecordOpenApiModule],
  controllers: [SmartSuiteImportController],
  providers: [SmartSuiteImportService],
  exports: [SmartSuiteImportService],
})
export class SmartSuiteImportModule {}
