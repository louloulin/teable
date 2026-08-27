/**
 * Health module — bundles the liveness and readiness controllers so the root
 * `AppModule` can register both endpoints with a single import.
 *
 * License: AGPL-3.0
 */

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ReadyController } from './ready.controller';

@Module({
  controllers: [HealthController, ReadyController],
})
export class HealthModule {}
