import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { QuotaModule } from '../quota/quota.module';

import { LicenseActivationController } from './license-activation.controller';
import { LicenseCapabilityController } from './license-capability.controller';
import { LicenseCapabilityService } from './license-capability.service';
import { LicenseService } from './license.service';

@Module({
  imports: [PrismaModule, QuotaModule],
  controllers: [LicenseCapabilityController, LicenseActivationController],
  providers: [LicenseService, LicenseCapabilityService],
  exports: [LicenseService, LicenseCapabilityService],
})
export class LicenseModule {}
