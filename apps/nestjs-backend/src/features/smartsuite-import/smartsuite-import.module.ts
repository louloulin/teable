import { Module } from '@nestjs/common';
import { SmartSuiteImportController } from './smartsuite-import.controller';
import { SmartSuiteImportService } from './smartsuite-import.service';

/**
 * Round-22: SmartSuite import module — minimal driver mirroring the
 * baserow-import (R16) + clickup-import (R17) + jira-import (R18) +
 * monday-import (R19) + nocodb-import (R20) + smartsheet-import (R21)
 * module pattern.
 *
 * Provides:
 *   - SmartSuiteImportService: probe, listApps, listTables, fetchRecords
 *   - SmartSuiteImportController: /api/smartsuite-import/{probe,apps,tables,records}
 *
 * ~225 LOC. SmartSuite uses REST + Bearer token, hierarchical
 * Solution > App > Table > Record model.
 */
@Module({
  controllers: [SmartSuiteImportController],
  providers: [SmartSuiteImportService],
  exports: [SmartSuiteImportService],
})
export class SmartSuiteImportModule {}
