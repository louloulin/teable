/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Data DB connection — admin HTTP controller (Round-INFRA-5).
 *
 *   GET    /api/admin/data-db-connection/connections
 *   GET    /api/admin/data-db-connection/connections/count
 *   POST   /api/admin/data-db-connection/connections
 *   DELETE /api/admin/data-db-connection/connections/:id
 *
 * License: AGPL-3.0
 */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { DataDbConnectionService } from './data-db-connection.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

interface ICreateConnectionBody {
  url?: string;
  internalSchema?: string;
}

@Controller('api/admin/data-db-connection')
@UseGuards(AdminGuard)
export class DataDbConnectionController {
  constructor(private readonly svc: DataDbConnectionService) {}

  @Get('connections')
  async list() {
    const connections = await this.svc.list();
    return { total: connections.length, connections };
  }

  @Get('connections/count')
  async count() {
    return { count: await this.svc.count() };
  }

  @Post('connections')
  async create(@Body() body: ICreateConnectionBody) {
    if (!body?.url) {
      throw new BadRequestException('url is required');
    }
    return this.svc.create({
      url: body.url,
      internalSchema: body.internalSchema,
      createdBy: 'usr_admin',
    });
  }

  @Delete('connections/:id')
  async remove(@Param('id') id: string) {
    const ok = await this.svc.remove(id);
    if (!ok) throw new NotFoundException(`connection not found: ${id}`);
    return { removed: true, id };
  }
}
