import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { QuotaModule } from '../quota/quota.module';
import { LicenseService } from './license.service';

@Module({
  imports: [PrismaModule, QuotaModule],
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}