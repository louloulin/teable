import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { LicenseKeySelfAdminController } from './license-key-self.admin.controller';
import { LicenseKeySelfAuthService } from './license-key-self.auth.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [LicenseKeySelfAdminController],
  providers: [LicenseKeySelfAuthService],
  exports: [LicenseKeySelfAuthService],
})
export class LicenseKeySelfModule {}
