import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { WorkspaceSwitchAuthService } from './workspace-switch.auth.service';

@Module({
  imports: [PrismaModule],
  providers: [WorkspaceSwitchAuthService],
  exports: [WorkspaceSwitchAuthService],
})
export class WorkspaceSwitchModule {}
