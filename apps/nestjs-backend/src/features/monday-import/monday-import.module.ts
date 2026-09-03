import { Module } from '@nestjs/common';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { MondayImportController } from './monday-import.controller';
import { MondayImportService } from './monday-import.service';

/**
 * Round-19: Monday import module — minimal driver mirroring the
 * baserow-import (R16) + clickup-import (R17) + jira-import (R18) module
 * pattern.
 *
 * Round-39: imports `RecordOpenApiModule` so the service can drive
 * `recordOpenApiV2Service.createRecords` for the full record-creation
 * path. Adds `listAllItems` + `importTable` to the service surface.
 *
 * Provides:
 *   - MondayImportService: probe, listWorkspaces, listBoards, fetchItems, listAllItems, importTable
 *   - MondayImportController: /api/monday-import/{probe,workspaces,boards,items}
 */
@Module({
  imports: [RecordOpenApiModule],
  controllers: [MondayImportController],
  providers: [MondayImportService],
  exports: [MondayImportService],
})
export class MondayImportModule {}
