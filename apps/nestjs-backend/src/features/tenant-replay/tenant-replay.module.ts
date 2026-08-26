/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tenant Replay — NestJS module.
 *
 * Wires the snapshot service to PrismaService and the replay service to
 * the existing space / base / table / field / record services via DI.
 *
 * IMPORTANT — this module is NOT imported by AppModule.  The CLI scripts
 * boot a dedicated Nest application via `NestFactory.create` and import
 * only this module.  Keeping the module out of AppModule preserves the
 * boundary between "production app" and "replay harness".
 */

import { Module } from '@nestjs/common';

import { BaseModule } from '../base/base.module';
import { FieldOpenApiModule } from '../field/open-api/field-open-api.module';
import { RecordModule } from '../record/record.module';
import { SpaceModule } from '../space/space.module';
import { TableModule } from '../table/table.module';
import { V2Module } from '../v2/v2.module';

import { TenantReplayService } from './tenant-replay.service';
import { TenantSnapshotService } from './tenant-snapshot.service';

@Module({
  imports: [
    SpaceModule,
    BaseModule,
    TableModule,
    FieldOpenApiModule,
    RecordModule,
    V2Module,
  ],
  providers: [TenantSnapshotService, TenantReplayService],
  exports: [TenantSnapshotService, TenantReplayService],
})
export class TenantReplayModule {}
