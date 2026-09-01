/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { LicenseModule } from '../license/license.module';
import { EmailDomainClaimAuthService } from './email-domain-claim.auth.service';
import { EmailDomainClaimController } from './email-domain-claim.controller';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [EmailDomainClaimController],
  providers: [EmailDomainClaimAuthService],
  exports: [EmailDomainClaimAuthService],
})
export class EmailDomainClaimModule {}
