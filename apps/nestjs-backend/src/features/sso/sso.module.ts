import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { DomainVerificationModule } from '../domain-verification/domain-verification.module';
import { LicenseModule } from '../license/license.module';
import { SsoController } from './sso.controller';
import { SsoService } from './sso.service';

@Module({
  imports: [PrismaModule, LicenseModule, DomainVerificationModule],
  controllers: [SsoController],
  providers: [SsoService],
  exports: [SsoService],
})
export class SsoModule {}