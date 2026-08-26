import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { ScimAdminController, ScimController } from './scim.controller';
import { ScimAuthGuard } from './scim-auth.guard';
import { ScimService } from './scim.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [ScimAdminController, ScimController],
  providers: [ScimService, ScimAuthGuard],
  exports: [ScimService],
})
export class ScimModule {}
