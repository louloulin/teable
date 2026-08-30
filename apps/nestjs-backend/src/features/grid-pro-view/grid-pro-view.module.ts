import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { GridProViewAuthController } from './grid-pro-view.auth.controller';
import { GridProViewAuthService } from './grid-pro-view.auth.service';

@Module({
  imports: [PrismaModule],
  controllers: [GridProViewAuthController],
  providers: [GridProViewAuthService],
  exports: [GridProViewAuthService],
})
export class GridProViewModule {}
