/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Federated SSO — admin HTTP controller (Stage 60).
 *
 *   GET /api/admin/federated-sso/list?baseId=...
 *   GET /api/admin/federated-sso/metadata?baseId=...&id=...
 *   GET /api/admin/federated-sso/discover?baseId=...&email=...
 *
 * Read-only views over the persisted SSO providers so admins can
 * audit which bases have which IdP integrations configured. Mutations
 * (create/update/delete) remain on the existing service.
 *
 * License: AGPL-3.0
 */
import { BadRequestException, Controller, Get, NotFoundException, Query, UseGuards } from '@nestjs/common';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { FederatedSsoAuthService } from './federated-sso.auth.service';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/federated-sso')
@UseGuards(AdminGuard)
export class FederatedSsoAdminController {
  constructor(private readonly svc: FederatedSsoAuthService) {}

  @Get('list')
  async list(@Query('baseId') baseId?: string) {
    if (!baseId) throw new BadRequestException('baseId is required');
    return this.svc.loadProviders(baseId);
  }

  @Get('metadata')
  async metadata(@Query('baseId') baseId: string, @Query('id') id: string) {
    if (!baseId || !id) throw new BadRequestException('baseId and id are required');
    const rows = await this.svc.loadProviders(baseId);
    const provider = rows.find((p) => p.id === id);
    if (!provider) throw new NotFoundException(`provider not found: ${id}`);
    return {
      provider,
      validation: this.svc.validate(provider),
    };
  }

  @Get('discover')
  async discover(@Query('baseId') baseId: string, @Query('email') email: string) {
    if (!baseId || !email) throw new BadRequestException('baseId and email are required');
    return this.svc.discover({ baseId, email });
  }
}
