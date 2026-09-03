import { Module } from '@nestjs/common';
import { RecordOpenApiModule } from '../record/open-api/record-open-api.module';
import { NocoDbImportController } from './nocodb-import.controller';
import { NocoDbImportService } from './nocodb-import.service';

/**
 * Round-20: NocoDB import module — minimal driver mirroring the
 * baserow-import (R16) + clickup-import (R17) + jira-import (R18) +
 * monday-import (R19) module pattern.
 *
 * Round-36: imports `RecordOpenApiModule` so the service can drive
 * `recordOpenApiV2Service.createRecords` for the full record-creation
 * path.
 *
 * Provides:
 *   - NocoDbImportService: probe, listBases, listTables, fetchRows,
 *     listAllRows, importTable (record creation)
 *   - NocoDbImportController: /api/nocodb-import/{probe,bases,tables,rows}
 *
 * ~280 LOC. NocoDB uses two API versions (v1 metadata, v2 rows) with
 * xc-token auth. Common pattern for self-hosted Airtable alternatives.
 */
@Module({
  imports: [RecordOpenApiModule],
  controllers: [NocoDbImportController],
  providers: [NocoDbImportService],
  exports: [NocoDbImportService],
})
export class NocoDbImportModule {}
