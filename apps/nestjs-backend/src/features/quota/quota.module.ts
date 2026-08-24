import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { QuotaController } from './quota.controller';
import { QuotaService } from './quota.service';

@Module({
  imports: [PrismaModule],
  controllers: [QuotaController],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}