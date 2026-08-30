import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { PresenceAuthService } from './presence.auth.service';

@Module({
  imports: [PrismaModule],
  providers: [PresenceAuthService],
  exports: [PresenceAuthService],
})
export class PresenceModule {}
