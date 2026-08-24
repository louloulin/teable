import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { LicenseModule } from '../license/license.module';
import { CustomDomainController } from './custom-domain.controller';
import { CustomDomainService } from './custom-domain.service';

@Module({
  imports: [PrismaModule, LicenseModule],
  controllers: [CustomDomainController],
  providers: [CustomDomainService],
  exports: [CustomDomainService],
})
export class CustomDomainModule {}