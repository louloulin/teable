import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { EventJobModule } from '../../event-emitter/event-job/event-job.module';
import { DomainVerificationModule } from '../domain-verification/domain-verification.module';
import { LicenseModule } from '../license/license.module';
import { UserModule } from '../user/user.module';
import { SsoAuthService } from './sso-auth.service';
import { SsoFederationController } from './sso-federation.controller';
import { SsoFederationService } from './sso-federation.service';
import { SsoLoginStateCleanupProcessor } from './sso-login-state-cleanup.processor';
import { SSO_LOGIN_STATE_CLEANUP_QUEUE } from './sso.constants';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';

@Module({
  imports: [
    PrismaModule,
    LicenseModule,
    DomainVerificationModule,
    UserModule,
    EventJobModule.registerQueue(SSO_LOGIN_STATE_CLEANUP_QUEUE),
  ],
  controllers: [SsoController, SsoFederationController],
  providers: [SsoService, SsoAuthService, SsoFederationService, SsoLoginStateCleanupProcessor],
  exports: [SsoService, SsoAuthService, SsoFederationService],
})
export class SsoModule {}
