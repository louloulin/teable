import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { ProfilerModule } from './profiling/profiler.module';

@Module({
  imports: [ProfilerModule],
  controllers: [MetricsController],
})
export class ObservabilityModule {}
