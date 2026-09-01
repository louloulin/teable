/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 * Org Quota Reservation — NestJS module wiring (Round-INFRA-7).
 *
 * Wraps OrgQuotaReservationAuthService into the NestJS container
 * so the admin panel can audit soft-reservation state while the
 * reservation hot-path stays on the AuthService.
 *
 * License: AGPL-3.0
 */
import { Module } from '@nestjs/common';

import { LicenseModule } from '../license/license.module';
import { OrgQuotaReservationAuthService } from './org-quota-reservation.auth.service';
import { OrgQuotaReservationController } from './org-quota-reservation.controller';

@Module({
  imports: [LicenseModule],
  controllers: [OrgQuotaReservationController],
  providers: [OrgQuotaReservationAuthService],
  exports: [OrgQuotaReservationAuthService],
})
export class OrgQuotaReservationModule {}
