import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { UserModule } from '../user/user.module';
import { DomainVerificationModule } from '../domain-verification/domain-verification.module';
import { LicenseModule } from '../license/license.module';
import { SsoController } from './sso.controller';
import { SsoAuthService } from './sso-auth.service';
import { SsoService } from './sso.service';

@Module({
  imports: [PrismaModule, LicenseModule, DomainVerificationModule, UserModule],
  controllers: [SsoController],
  providers: [SsoService, SsoAuthService],
  exports: [SsoService, SsoAuthService],
})
export class SsoModule {}