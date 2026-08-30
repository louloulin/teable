import { Module } from '@nestjs/common';
import { TotpAuthService } from './totp.auth.service';
import { TotpController } from './totp.controller';

@Module({
  controllers: [TotpController],
  providers: [TotpAuthService],
  exports: [TotpAuthService],
})
export class TotpModule {}
