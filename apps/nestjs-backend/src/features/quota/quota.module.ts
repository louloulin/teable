import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { QuotaController } from './quota.controller';
import { QuotaEnforcementInterceptor } from './quota.interceptor';
import { QuotaService } from './quota.service';

@Module({
  imports: [PrismaModule],
  controllers: [QuotaController],
  providers: [QuotaService, QuotaEnforcementInterceptor],
  exports: [QuotaService, QuotaEnforcementInterceptor],
})
export class QuotaModule {}