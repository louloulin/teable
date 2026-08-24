import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { PermissionGuard } from './permission.guard';
import { PermissionInterceptor } from './permission.interceptor';
import { PermissionMatrixController } from './permission-matrix.controller';
import { PermissionMatrixService } from './permission-matrix.service';

// Stage 5b — re-export the drop-in filter-merge helper so call sites can
// `import { applyPermissionFilter } from '../permission-matrix/...'` without
// reaching into a private utility file.
export { applyPermissionFilter } from './permission-filter-merge';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [PermissionMatrixController],
  providers: [PermissionMatrixService, PermissionInterceptor, PermissionGuard],
  exports: [PermissionMatrixService, PermissionInterceptor, PermissionGuard],
})
export class PermissionMatrixModule {}
