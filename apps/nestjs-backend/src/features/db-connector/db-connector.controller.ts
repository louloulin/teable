/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * DB connector — admin HTTP controller (Round-INFRA-4).
 *
 * Surfaces external database connector config + sync history for the
 * admin panel / operations dashboard. Wire-side mutations stay on
 * DbConnectorAuthService (called by base admins via the data-import UI).
 *
 *   GET /api/admin/db-connector/connectors/:baseId
 *   GET /api/admin/db-connector/connectors/get/:id
 *   GET /api/admin/db-connector/connectors/:id/syncs
 *   GET /api/admin/db-connector/syncs/:syncId
 *
 * License: AGPL-3.0
 */
import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';

import { DbConnectorAuthService } from './db-connector.auth.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';

const DbcGuard = LicenseCapabilityGuard.for('db_connector');

@Controller('api/admin/db-connector')
@UseGuards(DbcGuard)
export class DbConnectorController {
  constructor(private readonly auth: DbConnectorAuthService) {}

  @Get('connectors/:baseId')
  async listConnectors(
    @Param('baseId') baseId: string,
    @Query('kind') kind?: string
  ) {
    const connectors = await this.auth.listConnectors(
      baseId,
      (kind ?? undefined) as never
    );
    return { baseId, total: connectors.length, connectors };
  }

  @Get('connectors/get/:id')
  async getConnector(@Param('id') id: string) {
    const conn = await this.auth.getConnector(id);
    if (!conn) throw new NotFoundException(`connector not found: ${id}`);
    return conn;
  }

  @Get('connectors/:id/syncs')
  async listSyncs(
    @Param('id') connectorId: string,
    @Query('limit') limitStr?: string
  ) {
    const limit = Math.max(1, Math.min(200, Number(limitStr ?? 50) || 50));
    const syncs = await this.auth.listSyncs(connectorId, limit);
    return { connectorId, total: syncs.length, syncs };
  }

  @Get('syncs/:syncId')
  async getSync(@Param('syncId') syncId: string) {
    const sync = await this.auth.getSync(syncId);
    if (!sync) throw new NotFoundException(`sync not found: ${syncId}`);
    return sync;
  }
}
