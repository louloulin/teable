import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { UserModule } from '../user/user.module';
import { DomainVerificationModule } from '../domain-verification/domain-verification.module';
import { LicenseModule } from '../license/license.module';
import { SsoFederationController } from './sso-federation.controller';
import { SsoFederationService } from './sso-federation.service';
import { SsoController } from './sso.controller';
import { SsoAuthService } from './sso-auth.service';
import { SsoService } from './sso.service';

@Module({
  imports: [PrismaModule, LicenseModule, DomainVerificationModule, UserModule],
  controllers: [SsoController, SsoFederationController],
  providers: [SsoService, SsoAuthService, SsoFederationService],
  exports: [SsoService, SsoAuthService, SsoFederationService],
})
export class SsoModule {}