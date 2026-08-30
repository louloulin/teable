import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { IpAllowlistAuthService } from './ip-allowlist.auth.service';

@Module({
  imports: [PrismaModule],
  providers: [IpAllowlistAuthService],
  exports: [IpAllowlistAuthService],
})
export class IpAllowlistModule {}
