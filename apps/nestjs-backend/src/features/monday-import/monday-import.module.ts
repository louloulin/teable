import { Module } from '@nestjs/common';
import { MondayImportController } from './monday-import.controller';
import { MondayImportService } from './monday-import.service';

/**
 * Round-19: Monday.com import module — minimal driver mirroring the
 * baserow-import (R16) + clickup-import (R17) + jira-import (R18) module pattern.
 * First GraphQL-based driver in the suite (others are REST).
 *
 * Provides:
 *   - MondayImportService: probe, listWorkspaces, listBoards, fetchItems
 *   - MondayImportController: /api/monday-import/{probe,workspaces,boards,items}
 *
 * ~280 LOC. Monday.com API is GraphQL (POST single endpoint with queries).
 */
@Module({
  controllers: [MondayImportController],
  providers: [MondayImportService],
  exports: [MondayImportService],
})
export class MondayImportModule {}
