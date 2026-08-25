import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { ViewPermissionController } from './view-permission.controller';
import { ViewPermissionService } from './view-permission.service';

/**
 * View-level permission module — Stage 17.
 *
 * Provides fine-grained per-view ACL: a table admin can grant read /
 * write / owner to specific users or roles, or explicitly deny access
 * even when the user would otherwise qualify.
 */
@Module({
  imports: [PrismaModule],
  controllers: [ViewPermissionController],
  providers: [ViewPermissionService],
  exports: [ViewPermissionService],
})
export class ViewPermissionModule {}
