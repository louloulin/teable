import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { DomainVerificationController } from './domain-verification.controller';
import { DomainVerificationService } from './domain-verification.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [DomainVerificationController],
  providers: [DomainVerificationService],
  exports: [DomainVerificationService],
})
export class DomainVerificationModule {}
