import { Module } from '@nestjs/common';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { JiraImportController } from './jira-import.controller';
import { JiraImportService } from './jira-import.service';

/**
 * Round-18: Jira import module — minimal driver mirroring the
 * baserow-import (R16) + clickup-import (R17) module pattern.
 *
 * Round-38: imports `RecordOpenApiModule` so the service can drive
 * `recordOpenApiV2Service.createRecords` for the full record-creation
 * path. Adds `listAllIssues` + `importTable` to the service surface.
 *
 * Provides:
 *   - JiraImportService: probe, listProjects, fetchIssues, listAllIssues, importTable
 *   - JiraImportController: /api/jira-import/{probe,projects,issues}
 */
@Module({
  imports: [RecordOpenApiModule],
  controllers: [JiraImportController],
  providers: [JiraImportService],
  exports: [JiraImportService],
})
export class JiraImportModule {}
