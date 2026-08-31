import { Module } from '@nestjs/common';
import { NocoDbImportController } from './nocodb-import.controller';
import { NocoDbImportService } from './nocodb-import.service';

/**
 * Round-20: NocoDB import module — minimal driver mirroring the
 * baserow-import (R16) + clickup-import (R17) + jira-import (R18) +
 * monday-import (R19) module pattern.
 *
 * Provides:
 *   - NocoDbImportService: probe, listBases, listTables, fetchRows
 *   - NocoDbImportController: /api/nocodb-import/{probe,bases,tables,rows}
 *
 * ~250 LOC. NocoDB uses two API versions (v1 metadata, v2 rows) with
 * xc-token auth. Common pattern for self-hosted Airtable alternatives.
 */
@Module({
  controllers: [NocoDbImportController],
  providers: [NocoDbImportService],
  exports: [NocoDbImportService],
})
export class NocoDbImportModule {}
