import { Module } from '@nestjs/common';
import { BaserowImportController } from './baserow-import.controller';
import { BaserowImportService } from './baserow-import.service';

/**
 * Round-16: Baserow import module — minimal driver mirroring the
 * airtable-import module pattern (Round-5 wired). Provides:
 *   - BaserowImportService: probe, listFields, fetchRows
 *   - BaserowImportController: /api/baserow-import/{probe,rows,fields}
 *
 * The driver is intentionally small (~200 LOC). It demonstrates the
 * minimal shape of a migration source: API client + service + HTTP
 * boundary. The actual translation from Baserow fields → Teable fields
 * is out of scope for Round-16; that's a follow-up Round-17+ task.
 */
@Module({
  controllers: [BaserowImportController],
  providers: [BaserowImportService],
  exports: [BaserowImportService],
})
export class BaserowImportModule {}
