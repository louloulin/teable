import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { PermissionGuard } from './permission.guard';
import { PermissionInterceptor } from './permission.interceptor';
import { PermissionMatrixController } from './permission-matrix.controller';
import { PermissionMatrixService } from './permission-matrix.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [PermissionMatrixController],
  providers: [PermissionMatrixService, PermissionInterceptor, PermissionGuard],
  exports: [PermissionMatrixService, PermissionInterceptor, PermissionGuard],
})
export class PermissionMatrixModule {}
