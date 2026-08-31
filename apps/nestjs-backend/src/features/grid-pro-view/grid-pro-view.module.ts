import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { GridProViewAuthController } from './grid-pro-view.auth.controller';
import { GridProViewAuthService } from './grid-pro-view.auth.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [GridProViewAuthController],
  providers: [GridProViewAuthService],
  exports: [GridProViewAuthService],
})
export class GridProViewModule {}
