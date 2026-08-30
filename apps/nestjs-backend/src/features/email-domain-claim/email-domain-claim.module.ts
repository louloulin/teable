import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';
import { EmailDomainClaimAuthService } from './email-domain-claim.auth.service';

@Module({
  imports: [PrismaModule],
  providers: [EmailDomainClaimAuthService],
  exports: [EmailDomainClaimAuthService],
})
export class EmailDomainClaimModule {}
