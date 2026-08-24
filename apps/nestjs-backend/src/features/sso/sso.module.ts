import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { DomainVerificationModule } from '../domain-verification/domain-verification.module';
import { LicenseModule } from '../license/license.module';
import { SsoController } from './sso.controller';
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
    BullModule.registerQueue({ name: SSO_LOGIN_STATE_CLEANUP_QUEUE }),
  ],
  controllers: [SsoController],
  providers: [SsoService, SsoLoginStateCleanupProcessor],
  exports: [SsoService],
})
export class SsoModule {}