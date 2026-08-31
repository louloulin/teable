import { Module } from '@nestjs/common';
import { SmartsheetImportController } from './smartsheet-import.controller';
import { SmartsheetImportService } from './smartsheet-import.service';

/**
 * Round-21: Smartsheet import module — minimal driver mirroring the
 * baserow-import (R16) + clickup-import (R17) + jira-import (R18) +
 * monday-import (R19) + nocodb-import (R20) module pattern.
 *
 * Provides:
 *   - SmartsheetImportService: probe, listSheets, fetchRows
 *   - SmartsheetImportController: /api/smartsheet-import/{probe,sheets,rows}
 *
 * ~220 LOC. Smartsheet uses REST + Bearer token, paginated sheet list.
 */
@Module({
  controllers: [SmartsheetImportController],
  providers: [SmartsheetImportService],
  exports: [SmartsheetImportService],
})
export class SmartsheetImportModule {}
