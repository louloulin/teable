import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { PermissionMatrixController } from './permission-matrix.controller';
import { PermissionMatrixService } from './permission-matrix.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [PermissionMatrixController],
  providers: [PermissionMatrixService],
  exports: [PermissionMatrixService],
})
export class PermissionMatrixModule {}
