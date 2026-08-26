import { Module } from '@nestjs/common';
import { LicenseModule } from '../license/license.module';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [LicenseModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
