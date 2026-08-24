import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { UserModule } from '../user/user.module';
import { DomainVerificationModule } from '../domain-verification/domain-verification.module';
import { LicenseModule } from '../license/license.module';
import { SsoController } from './sso.controller';
import { SsoAuthService } from './sso-auth.service';
import { SsoLoginStateCleanupProcessor } from './sso-login-state-cleanup.processor';
import {
  SSO_LOGIN_STATE_CLEANUP_QUEUE,
} from './sso.constants';
import { SsoService } from './sso.service';

@Module({
  imports: [
    PrismaModule,
    LicenseModule,
    DomainVerificationModule,
    UserModule,
    BullModule.registerQueue({ name: SSO_LOGIN_STATE_CLEANUP_QUEUE }),
  ],
  controllers: [SsoController],
  providers: [SsoService, SsoAuthService, SsoLoginStateCleanupProcessor],
  exports: [SsoService, SsoAuthService],
})
export class SsoModule {}
