import { Module } from '@nestjs/common';
import { ClickUpImportController } from './clickup-import.controller';
import { ClickUpImportService } from './clickup-import.service';

/**
 * Round-17: ClickUp import module — minimal driver mirroring the
 * baserow-import module pattern (Round-16 wired). Provides:
 *   - ClickUpImportService: probe, listSpaces, listLists, fetchTasks
 *   - ClickUpImportController: /api/clickup-import/{probe,spaces,lists,tasks}
 *
 * ~200 LOC; the actual translation from ClickUp tasks → Teable records
 * is out of scope for Round-17; that's a follow-up Round-18+ task.
 */
@Module({
  controllers: [ClickUpImportController],
  providers: [ClickUpImportService],
  exports: [ClickUpImportService],
})
export class ClickUpImportModule {}
