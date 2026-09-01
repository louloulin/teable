import { Module } from '@nestjs/common';
import { TotpAuthService } from './totp.auth.service';
import { TotpAdminController } from './totp.admin.controller';
import { TotpController } from './totp.controller';

@Module({
  controllers: [TotpController, TotpAdminController],
  providers: [TotpAuthService],
  exports: [TotpAuthService],
})
export class TotpModule {}
