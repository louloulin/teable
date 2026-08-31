import { Module } from '@nestjs/common';
import { JiraImportController } from './jira-import.controller';
import { JiraImportService } from './jira-import.service';

/**
 * Round-18: Jira import module — minimal driver mirroring the
 * baserow-import (R16) + clickup-import (R17) module pattern.
 * Provides:
 *   - JiraImportService: probe, listProjects, fetchIssues
 *   - JiraImportController: /api/jira-import/{probe,projects,issues}
 *
 * ~290 LOC. Jira Cloud REST v3 with HTTP Basic (email + API token).
 * Jira-specific fields (ADF, custom fields) are out of scope for R18;
 * downstream translator is follow-up.
 */
@Module({
  controllers: [JiraImportController],
  providers: [JiraImportService],
  exports: [JiraImportService],
})
export class JiraImportModule {}
