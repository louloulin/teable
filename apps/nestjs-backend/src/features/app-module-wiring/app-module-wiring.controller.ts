/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * App module wiring — admin HTTP controller (Round-INFRA-5).
 *
 * Surfaces the NestJS module manifest for the admin panel:
 *   GET /api/admin/app-module/manifest
 *   GET /api/admin/app-module/install-order
 *   GET /api/admin/app-module/count
 *   GET /api/admin/app-module/required
 *   GET /api/admin/app-module/by-round/:round
 *   GET /api/admin/app-module/find/:name
 *
 * Capability presence tracks module wiring, not which modules are
 * actually loaded in this instance — the admin UI can compare the
 * expected manifest against the live NestJS container.
 *
 * License: AGPL-3.0
 */
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';

import { AppModuleWiringAuthService } from './app-module-wiring.auth.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/app-module')
@UseGuards(AdminGuard)
export class AppModuleWiringController {
  constructor(private readonly auth: AppModuleWiringAuthService) {}

  @Get('manifest')
  async manifest() {
    return this.auth.loadManifest();
  }

  @Get('install-order')
  async installOrder() {
    const order = await this.auth.installOrder();
    return { order, total: order.length };
  }

  @Get('count')
  async count() {
    return { count: await this.auth.count() };
  }

  @Get('required')
  async required() {
    return { required: await this.auth.requiredNames() };
  }

  @Get('by-round/:round')
  async byRound(@Param('round', ParseIntPipe) round: number) {
    const modules = await this.auth.filterByRound({ round });
    return { round, total: modules.length, modules };
  }

  @Get('find/:name')
  async find(@Param('name') name: string) {
    const wire = await this.auth.findWire({ name });
    if (!wire) throw new NotFoundException(`module wire not found: ${name}`);
    return wire;
  }
}
