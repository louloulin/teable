import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { DataResidencyAuthService } from './data-residency.auth.service';
import { DataResidencyController } from './data-residency.controller';

/**
 * Round-29: Data residency NestJS module.
 *
 * Wires the existing DataResidencyAuthService (region CRUD, policy CRUD,
 * authorizeRequest) to the HTTP layer via the new DataResidencyController.
 *
 * The pure helpers in data-residency.service.ts (isValidRegionCode,
 * normalizeRegionFromHeader, resolveRegionRoute, validatePolicyTransition)
 * are consumed exclusively by the auth service.
 */
@Module({
  imports: [PrismaModule],
  controllers: [DataResidencyController],
  providers: [DataResidencyAuthService],
  exports: [DataResidencyAuthService],
})
export class DataResidencyModule {}
