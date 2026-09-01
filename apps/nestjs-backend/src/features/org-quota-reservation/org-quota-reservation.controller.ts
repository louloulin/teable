/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Org Quota Reservation — admin HTTP controller (Round-INFRA-7).
 *
 * Surfaces per-org soft reservations (Stage 73) so admins can
 * audit who has pre-reserved slices of the org envelope. Wire-side
 * mutations (upsertReservation, release, consume) stay on
 * OrgQuotaReservationAuthService.
 *
 *   GET /api/admin/org-quota-reservation/:orgId
 *   GET /api/admin/org-quota-reservation/:orgId/count
 *   GET /api/admin/org-quota-reservation/status/:reservationId
 *
 * Gated by the `admin_panel` capability.
 *
 * License: AGPL-3.0
 */
import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';

import { LicenseCapabilityGuard } from '../license/license-capability.guard';
import { OrgQuotaReservationAuthService } from './org-quota-reservation.auth.service';

const AdminGuard = LicenseCapabilityGuard.for('admin_panel');

@Controller('api/admin/org-quota-reservation')
@UseGuards(AdminGuard)
export class OrgQuotaReservationController {
  constructor(
    private readonly auth: OrgQuotaReservationAuthService,
    private readonly prisma: PrismaService
  ) {}

  @Get(':orgId')
  async listForOrg(@Param('orgId') orgId: string) {
    const reservations = await this.auth.listReservations(orgId);
    return { organizationId: orgId, total: reservations.length, reservations };
  }

  @Get(':orgId/count')
  async countForOrg(@Param('orgId') orgId: string): Promise<{ organizationId: string; count: number }> {
    const count = await this.prisma.orgQuotaReservation.count({ where: { orgId } });
    return { organizationId: orgId, count };
  }

  @Get('status/:reservationId')
  async getStatus(@Param('reservationId') reservationId: string) {
    const reservation = await this.auth.loadReservation(reservationId);
    if (!reservation) {
      throw new NotFoundException(`reservation not found: ${reservationId}`);
    }
    return { reservation };
  }
}
