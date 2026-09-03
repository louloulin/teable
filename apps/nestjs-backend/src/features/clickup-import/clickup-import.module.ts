import { Module } from '@nestjs/common';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { ClickUpImportController } from './clickup-import.controller';
import { ClickUpImportService } from './clickup-import.service';

/**
 * Round-17: ClickUp import module — minimal driver mirroring the
 * baserow-import (R16) + jira-import (R18) + monday-import (R19)
 * module pattern.
 *
 * Round-40: imports `RecordOpenApiModule` so the service can drive
 * `recordOpenApiV2Service.createRecords` for the full record-creation
 * path. Adds `listAllTasks` + `importTable` to the service surface.
 *
 * Provides:
 *   - ClickUpImportService: probe, listSpaces, listLists, fetchTasks, listAllTasks, importTable
 *   - ClickUpImportController: /api/clickup-import/{probe,spaces,lists,tasks}
 */
@Module({
  imports: [RecordOpenApiModule],
  controllers: [ClickUpImportController],
  providers: [ClickUpImportService],
  exports: [ClickUpImportService],
})
export class ClickUpImportModule {}
