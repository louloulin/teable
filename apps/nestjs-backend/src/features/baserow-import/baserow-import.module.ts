import { Module } from '@nestjs/common';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { BaserowImportController } from './baserow-import.controller';
import { BaserowImportService } from './baserow-import.service';

/**
 * Round-16: Baserow import module — minimal driver mirroring the
 * airtable-import module pattern (Round-5 wired). Provides:
 *   - BaserowImportService: probe, listFields, fetchRows
 *   - BaserowImportController: /api/baserow-import/{probe,rows,fields}
 *
 * Round-37: imports `RecordOpenApiModule` so the service can drive
 * `recordOpenApiV2Service.createRecords` for the full record-creation
 * path. Adds `listAllRows` + `importTable` to the service surface.
 *
 * The driver is intentionally small (~200 LOC). It demonstrates the
 * minimal shape of a migration source: API client + service + HTTP
 * boundary. The actual translation from Baserow fields → Teable fields
 * is out of scope for Round-16; that's a follow-up Round-17+ task.
 */
@Module({
  imports: [RecordOpenApiModule],
  controllers: [BaserowImportController],
  providers: [BaserowImportService],
  exports: [BaserowImportService],
})
export class BaserowImportModule {}
