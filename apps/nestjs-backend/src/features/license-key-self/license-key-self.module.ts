import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseKeySelfAdminController } from './license-key-self.admin.controller';
import { LicenseKeySelfAuthService } from './license-key-self.auth.service';

@Module({
  imports: [PrismaModule],
  controllers: [LicenseKeySelfAdminController],
  providers: [LicenseKeySelfAuthService],
  exports: [LicenseKeySelfAuthService],
})
export class LicenseKeySelfModule {}
