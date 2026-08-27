/**
 * NestJS module — registers the cost-forecaster controller.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { AiCostForecasterController } from './ai-cost-forecaster.controller';

@Module({
  controllers: [AiCostForecasterController],
})
export class AiCostForecasterModule {}
